import json
import os
from pathlib import Path

from typer.testing import CliRunner

from concentray_cli.cli_app import app


runner = CliRunner()


def seed_store(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "tasks": [
                    {
                        "id": "task-openclaw",
                        "title": "OpenClaw task",
                        "status": "pending",
                        "assignee": "ai",
                        "target_runtime": "openclaw",
                        "execution_mode": "autonomous",
                        "ai_urgency": 5,
                        "context_link": None,
                        "input_request": None,
                        "input_response": None,
                        "active_run_id": None,
                        "check_in_requested_at": None,
                        "check_in_requested_by": None,
                        "created_at": "2026-03-03T10:00:00+00:00",
                        "updated_at": "2026-03-03T10:00:00+00:00",
                        "updated_by": "human",
                    },
                    {
                        "id": "task-shared",
                        "title": "Shared task",
                        "status": "pending",
                        "assignee": "ai",
                        "target_runtime": None,
                        "execution_mode": "autonomous",
                        "ai_urgency": 4,
                        "context_link": None,
                        "input_request": None,
                        "input_response": None,
                        "active_run_id": None,
                        "check_in_requested_at": None,
                        "check_in_requested_by": None,
                        "created_at": "2026-03-03T10:01:00+00:00",
                        "updated_at": "2026-03-03T10:01:00+00:00",
                        "updated_by": "human",
                    },
                ],
                "notes": [],
                "runs": [],
                "activity": [],
            }
        )
    )


def cli_env(store: Path) -> dict[str, str]:
    return {
        "TM_LOCAL_STORE": str(store),
        "TM_UPDATED_BY": "ai",
    }


def test_claim_next_prefers_targeted_task(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)

    result = runner.invoke(
        app,
        [
            "task",
            "claim-next",
            "--runtime",
            "openclaw",
            "--worker-id",
            "openclaw:autonomous:test:main",
            "--json",
        ],
        env={**os.environ, **cli_env(store)},
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["task"]["id"] == "task-openclaw"
    assert payload["active_run"]["worker_id"] == "openclaw:autonomous:test:main"


def test_claim_next_resumes_same_worker_run(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)
    env = {**os.environ, **cli_env(store)}

    first = runner.invoke(
        app,
        ["task", "claim-next", "--runtime", "openclaw", "--worker-id", "openclaw:autonomous:test:main", "--json"],
        env=env,
    )
    second = runner.invoke(
        app,
        ["task", "claim-next", "--runtime", "openclaw", "--worker-id", "openclaw:autonomous:test:main", "--json"],
        env=env,
    )
    assert first.exit_code == 0
    assert second.exit_code == 0
    first_payload = json.loads(first.stdout)
    second_payload = json.loads(second.stdout)
    assert first_payload["active_run"]["id"] == second_payload["active_run"]["id"]
    assert second_payload["task"]["id"] == "task-openclaw"


def test_wrong_worker_update_is_rejected(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)
    env = {**os.environ, **cli_env(store)}
    claim = runner.invoke(
        app,
        ["task", "claim-next", "--runtime", "openclaw", "--worker-id", "openclaw:autonomous:test:main", "--json"],
        env=env,
    )
    assert claim.exit_code == 0

    result = runner.invoke(
        app,
        [
            "task",
            "update",
            "task-openclaw",
            "--runtime",
            "openclaw",
            "--worker-id",
            "openclaw:autonomous:test:other",
            "--status",
            "done",
            "--json",
        ],
        env=env,
    )
    assert result.exit_code != 0
    assert "leased by" in str(result.exception).lower()


def test_request_check_in_and_heartbeat_surface_pending_request(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)
    env = {**os.environ, **cli_env(store)}

    claim = runner.invoke(
        app,
        ["task", "claim-next", "--runtime", "openclaw", "--worker-id", "openclaw:autonomous:test:main", "--json"],
        env=env,
    )
    assert claim.exit_code == 0

    check_in = runner.invoke(
        app,
        ["task", "request-check-in", "task-openclaw", "--json"],
        env={**env, "TM_UPDATED_BY": "human"},
    )
    assert check_in.exit_code == 0

    heartbeat = runner.invoke(
        app,
        ["task", "heartbeat", "task-openclaw", "--runtime", "openclaw", "--worker-id", "openclaw:autonomous:test:main", "--json"],
        env=env,
    )
    assert heartbeat.exit_code == 0
    payload = json.loads(heartbeat.stdout)
    assert payload["pending_check_in"]["requested_by"] == "human"


def test_task_respond_unblocks_human_blocker(tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    seed_store(store)
    env = {**os.environ, **cli_env(store)}

    claim = runner.invoke(
        app,
        ["task", "claim-next", "--runtime", "openclaw", "--worker-id", "openclaw:autonomous:test:main", "--json"],
        env=env,
    )
    assert claim.exit_code == 0

    block = runner.invoke(
        app,
        [
            "task",
            "update",
            "task-openclaw",
            "--status",
            "blocked",
            "--assignee",
            "human",
            "--runtime",
            "openclaw",
            "--worker-id",
            "openclaw:autonomous:test:main",
            "--input-request",
            '{"schema_version":"1.0","request_id":"req-1","type":"choice","prompt":"Choose a lane.","required":true,"created_at":"2026-03-03T10:00:00+00:00","options":["main","staging"]}',
            "--json",
        ],
        env=env,
    )
    assert block.exit_code == 0

    respond = runner.invoke(
        app,
        ["task", "respond", "task-openclaw", "--response", '{"type":"choice","selections":["main"]}', "--json"],
        env={**env, "TM_UPDATED_BY": "human"},
    )
    assert respond.exit_code == 0
    payload = json.loads(respond.stdout)
    assert payload["task"]["status"] == "pending"
    assert payload["task"]["assignee"] == "ai"
    assert payload["task"]["target_runtime"] == "openclaw"
    assert payload["task"]["execution_mode"] == "autonomous"
    assert payload["task"]["input_request"] is None
    assert payload["task"]["input_response"]["selections"] == ["main"]

    reclaim = runner.invoke(
        app,
        ["task", "claim-next", "--runtime", "openclaw", "--worker-id", "openclaw:autonomous:test:main", "--json"],
        env=env,
    )
    assert reclaim.exit_code == 0
    reclaim_payload = json.loads(reclaim.stdout)
    assert reclaim_payload["task"]["id"] == "task-openclaw"
