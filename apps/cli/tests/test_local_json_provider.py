import json
from pathlib import Path
from threading import Barrier, Thread

import pytest

from concentray_cli.models import Runtime, TaskExecutionMode, TaskStatus, UpdatedBy
from concentray_cli.providers.local_json import LocalJsonProvider


def _task(
    task_id: str,
    *,
    status: str = "pending",
    assignee: str = "ai",
    target_runtime: str | None = None,
    execution_mode: str = "autonomous",
    ai_urgency: int = 3,
    created_at: str = "2026-03-03T10:00:00+00:00",
    updated_at: str | None = None,
    updated_by: str = "human",
    active_run_id: str | None = None,
    input_request: dict | None = None,
    input_response: dict | None = None,
) -> dict:
    return {
        "id": task_id,
        "title": task_id,
        "status": status,
        "assignee": assignee,
        "target_runtime": target_runtime,
        "execution_mode": execution_mode,
        "ai_urgency": ai_urgency,
        "context_link": None,
        "input_request": input_request,
        "input_response": input_response,
        "active_run_id": active_run_id,
        "check_in_requested_at": None,
        "check_in_requested_by": None,
        "created_at": created_at,
        "updated_at": updated_at or created_at,
        "updated_by": updated_by,
    }


def _run(
    run_id: str,
    task_id: str,
    *,
    runtime: str = "openclaw",
    worker_id: str = "openclaw:autonomous:test:old",
    status: str = "active",
    started_at: str = "2026-03-03T10:00:00+00:00",
    last_heartbeat_at: str = "2026-03-03T10:00:00+00:00",
    ended_at: str | None = None,
    lease_seconds: int = 600,
    end_reason: str | None = None,
) -> dict:
    return {
        "id": run_id,
        "task_id": task_id,
        "runtime": runtime,
        "worker_id": worker_id,
        "status": status,
        "started_at": started_at,
        "last_heartbeat_at": last_heartbeat_at,
        "ended_at": ended_at,
        "lease_seconds": lease_seconds,
        "end_reason": end_reason,
    }


def _seed_store(
    path: Path,
    *,
    tasks: list[dict],
    runs: list[dict] | None = None,
    notes: list[dict] | None = None,
    activity: list[dict] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "tasks": tasks,
                "notes": notes or [],
                "runs": runs or [],
                "activity": activity or [],
            }
        )
    )


def test_claim_next_orders_targeted_before_shared_and_sorts_within_bucket(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(
        store,
        tasks=[
            _task("shared-b", target_runtime=None, ai_urgency=5, created_at="2026-03-03T10:00:00+00:00"),
            _task("target-low", target_runtime="openclaw", ai_urgency=4, created_at="2026-03-03T09:58:00+00:00"),
            _task("target-new-high", target_runtime="openclaw", ai_urgency=5, created_at="2026-03-03T10:01:00+00:00"),
            _task("target-old-high", target_runtime="openclaw", ai_urgency=5, created_at="2026-03-03T09:59:00+00:00"),
            _task("shared-a", target_runtime=None, ai_urgency=5, created_at="2026-03-03T10:00:00+00:00"),
        ],
    )
    provider = LocalJsonProvider(store)

    claimed_ids: list[str] = []
    for index in range(5):
        task, _run = provider.claim_next_task(
            runtime=Runtime.OPENCLAW,
            worker_id=f"openclaw:autonomous:test:w{index}",
            statuses=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            execution_modes=[TaskExecutionMode.AUTONOMOUS],
            updated_by=UpdatedBy.AI,
        )
        assert task is not None
        claimed_ids.append(task.id)

    assert claimed_ids == [
        "target-old-high",
        "target-new-high",
        "target-low",
        "shared-a",
        "shared-b",
    ]


def test_runtime_specific_claims_skip_other_runtime_targets(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(
        store,
        tasks=[
            _task("claude-only", target_runtime="claude", ai_urgency=5),
            _task("shared", target_runtime=None, ai_urgency=1),
        ],
    )
    provider = LocalJsonProvider(store)

    openclaw_next = provider.get_next_task(
        Runtime.OPENCLAW,
        [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
        execution_modes=[TaskExecutionMode.AUTONOMOUS],
    )
    claude_next = provider.get_next_task(
        Runtime.CLAUDE,
        [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
        execution_modes=[TaskExecutionMode.AUTONOMOUS],
    )

    assert openclaw_next is not None
    assert openclaw_next.id == "shared"
    assert claude_next is not None
    assert claude_next.id == "claude-only"


def test_stale_run_expires_and_task_can_be_reclaimed(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(
        store,
        tasks=[
            _task(
                "stale-task",
                status="in_progress",
                target_runtime="openclaw",
                active_run_id="run-stale",
                created_at="2026-03-03T10:00:00+00:00",
            )
        ],
        runs=[
            _run(
                "run-stale",
                "stale-task",
                worker_id="openclaw:autonomous:test:old",
                started_at="2026-01-01T00:00:00+00:00",
                last_heartbeat_at="2026-01-01T00:00:00+00:00",
            )
        ],
    )
    provider = LocalJsonProvider(store)

    task, active_run = provider.claim_next_task(
        runtime=Runtime.OPENCLAW,
        worker_id="openclaw:autonomous:test:new",
        statuses=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
        execution_modes=[TaskExecutionMode.AUTONOMOUS],
        updated_by=UpdatedBy.AI,
    )

    assert task is not None
    assert active_run is not None
    assert task.id == "stale-task"
    assert task.status == "in_progress"
    assert active_run.worker_id == "openclaw:autonomous:test:new"
    assert active_run.id != "run-stale"

    payload = json.loads(store.read_text())
    expired_run = next(run for run in payload["runs"] if run["id"] == "run-stale")
    replacement_run = next(run for run in payload["runs"] if run["id"] == active_run.id)
    activity_kinds = [entry["kind"] for entry in payload["activity"] if entry["task_id"] == "stale-task"]

    assert expired_run["status"] == "expired"
    assert expired_run["end_reason"] == "lease_expired"
    assert replacement_run["status"] == "active"
    assert activity_kinds == ["run_expired", "claimed"]


def test_concurrent_claims_only_one_worker_wins(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(
        store,
        tasks=[_task("shared-task", target_runtime=None)],
    )

    barrier = Barrier(3)
    results: dict[str, str | None] = {}

    def _claim(worker_id: str) -> None:
        provider = LocalJsonProvider(store)
        barrier.wait()
        task, _run = provider.claim_next_task(
            runtime=Runtime.OPENCLAW,
            worker_id=worker_id,
            statuses=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            execution_modes=[TaskExecutionMode.AUTONOMOUS],
            updated_by=UpdatedBy.AI,
        )
        results[worker_id] = task.id if task else None

    workers = [
        "openclaw:autonomous:test:w1",
        "openclaw:autonomous:test:w2",
    ]
    threads = [Thread(target=_claim, args=(worker,)) for worker in workers]
    for thread in threads:
        thread.start()

    barrier.wait()

    for thread in threads:
        thread.join(timeout=5)

    winners = [task_id for task_id in results.values() if task_id is not None]
    payload = json.loads(store.read_text())

    assert len(winners) == 1
    assert winners == ["shared-task"]
    assert len(payload["runs"]) == 1
    assert payload["tasks"][0]["active_run_id"] == payload["runs"][0]["id"]


def test_add_note_creates_human_note_and_activity_record(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(store, tasks=[_task("task-1", assignee="human", execution_mode="session")])
    provider = LocalJsonProvider(store)

    note = provider.add_note(
        "task-1",
        author=UpdatedBy.HUMAN,
        content="Attached the updated launch checklist.",
        kind="attachment",
        attachment={"filename": "launch-checklist.txt"},
    )

    notes = provider.list_notes("task-1")
    activity = provider.list_activity("task-1")

    assert len(notes) == 1
    assert notes[0].id == note.id
    assert notes[0].kind == "attachment"
    assert activity[-1].kind == "note_added"
    assert activity[-1].payload == {"note_id": note.id, "kind": "attachment"}


def test_update_task_rejects_input_request_without_human_blocked_state(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(store, tasks=[_task("task-1", target_runtime="openclaw")])
    provider = LocalJsonProvider(store)

    with pytest.raises(ValueError, match="input_request requires status='blocked' and assignee='human'"):
        provider.update_task(
            "task-1",
            {
                "input_request": {
                    "schema_version": "1.0",
                    "request_id": "req-1",
                    "type": "choice",
                    "prompt": "Choose a deploy target.",
                    "required": True,
                    "created_at": "2026-03-03T10:00:00+00:00",
                    "options": ["main", "staging"],
                }
            },
            updated_by=UpdatedBy.AI,
            runtime=Runtime.OPENCLAW,
            worker_id="openclaw:autonomous:test:main",
            allow_override=True,
        )


@pytest.mark.parametrize(
    ("input_request", "response", "expected_type"),
    [
        (
            {
                "schema_version": "1.0",
                "request_id": "req-choice",
                "type": "choice",
                "prompt": "Choose a deploy target.",
                "required": True,
                "created_at": "2026-03-03T10:00:00+00:00",
                "options": ["main", "staging"],
                "allow_multiple": False,
            },
            {"type": "choice", "selections": ["main"]},
            "choice",
        ),
        (
            {
                "schema_version": "1.0",
                "request_id": "req-approve",
                "type": "approve_reject",
                "prompt": "Ship the release?",
                "required": True,
                "created_at": "2026-03-03T10:00:00+00:00",
                "approve_label": "Ship",
                "reject_label": "Hold",
            },
            {"type": "approve_reject", "approved": True},
            "approve_reject",
        ),
        (
            {
                "schema_version": "1.0",
                "request_id": "req-text",
                "type": "text_input",
                "prompt": "Provide the exact company tagline.",
                "required": True,
                "created_at": "2026-03-03T10:00:00+00:00",
                "max_length": 200,
            },
            {"type": "text_input", "value": "The durable coordination layer."},
            "text_input",
        ),
        (
            {
                "schema_version": "1.0",
                "request_id": "req-file",
                "type": "file_or_photo",
                "prompt": "Upload the signed approval PDF.",
                "required": True,
                "created_at": "2026-03-03T10:00:00+00:00",
                "accept": ["application/pdf"],
                "max_files": 1,
                "max_size_mb": 5,
            },
            {
                "type": "file_or_photo",
                "files": [
                    {
                        "kind": "file",
                        "filename": "approval.pdf",
                        "mime_type": "application/pdf",
                        "size_bytes": 4096,
                        "download_link": "http://127.0.0.1:8787/files/approval.pdf",
                    }
                ],
            },
            "file_or_photo",
        ),
    ],
)
def test_respond_to_input_request_unblocks_and_stores_typed_response(
    tmp_path: Path,
    input_request: dict,
    response: dict,
    expected_type: str,
) -> None:
    store = tmp_path / "store.json"
    _seed_store(
        store,
        tasks=[
            _task(
                "blocked-task",
                status="blocked",
                assignee="human",
                target_runtime="openclaw",
                input_request=input_request,
                execution_mode="autonomous",
            )
        ],
    )
    provider = LocalJsonProvider(store)

    updated = provider.respond_to_input_request(
        "blocked-task",
        updated_by=UpdatedBy.HUMAN,
        response=response,
    )

    assert updated.status == "pending"
    assert updated.assignee == "ai"
    assert updated.input_request is None
    assert updated.input_response is not None
    assert updated.input_response["type"] == expected_type

    activity = provider.list_activity("blocked-task")
    assert activity[-1].kind == "input_responded"


def test_respond_to_input_request_rejects_mismatched_payload(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(
        store,
        tasks=[
            _task(
                "blocked-task",
                status="blocked",
                assignee="human",
                target_runtime="openclaw",
                input_request={
                    "schema_version": "1.0",
                    "request_id": "req-choice",
                    "type": "choice",
                    "prompt": "Choose a deploy target.",
                    "required": True,
                    "created_at": "2026-03-03T10:00:00+00:00",
                    "options": ["main", "staging"],
                },
            )
        ],
    )
    provider = LocalJsonProvider(store)

    with pytest.raises(ValueError, match="must match the active input request type"):
        provider.respond_to_input_request(
            "blocked-task",
            updated_by=UpdatedBy.HUMAN,
            response={"type": "approve_reject", "approved": True},
        )


def test_respond_to_input_request_requires_active_request(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(store, tasks=[_task("task-1", target_runtime="openclaw")])
    provider = LocalJsonProvider(store)

    with pytest.raises(ValueError, match="does not have an active input request"):
        provider.respond_to_input_request(
            "task-1",
            updated_by=UpdatedBy.HUMAN,
            response={"type": "text_input", "value": "Done"},
        )


def test_respond_to_input_request_ends_orphaned_active_run(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    _seed_store(
        store,
        tasks=[
            _task(
                "blocked-task",
                status="blocked",
                assignee="human",
                target_runtime="openclaw",
                input_request={
                    "schema_version": "1.0",
                    "request_id": "req-choice",
                    "type": "choice",
                    "prompt": "Choose a deploy target.",
                    "required": True,
                    "created_at": "2026-03-03T10:00:00+00:00",
                    "options": ["main", "staging"],
                },
                active_run_id="run-1",
            )
        ],
        runs=[
            _run(
                "run-1",
                "blocked-task",
                worker_id="openclaw:autonomous:test:main",
                status="active",
                started_at="2099-01-01T00:00:00+00:00",
                last_heartbeat_at="2099-01-01T00:00:00+00:00",
            )
        ],
    )
    provider = LocalJsonProvider(store)

    updated = provider.respond_to_input_request(
        "blocked-task",
        updated_by=UpdatedBy.HUMAN,
        response={"type": "choice", "selections": ["main"]},
    )

    assert updated.active_run_id is None
    assert provider.get_active_run("blocked-task") is None

    payload = json.loads(store.read_text())
    run = next(item for item in payload["runs"] if item["id"] == "run-1")
    assert run["status"] == "ended"
    assert run["end_reason"] == "input_responded"
