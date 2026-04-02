import json
import os
import subprocess
import sys
from pathlib import Path


def seed_store(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "tasks": [
                    {
                        "id": "task-wrapper-1",
                        "title": "Wrapper test",
                        "status": "pending",
                        "assignee": "ai",
                        "target_runtime": "openclaw",
                        "execution_mode": "autonomous",
                        "ai_urgency": 4,
                        "context_link": None,
                        "input_request": None,
                        "input_response": None,
                        "active_run_id": None,
                        "check_in_requested_at": None,
                        "check_in_requested_by": None,
                        "created_at": "2026-03-03T10:00:00+00:00",
                        "updated_at": "2026-03-03T10:00:00+00:00",
                        "updated_by": "human",
                    }
                ],
                "notes": [],
                "runs": [],
                "activity": [],
            }
        )
    )


def invoke_tool(repo_root: Path, env: dict[str, str], tool: str, payload: dict[str, object]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(repo_root / "openclaw" / "plugin_tools" / "invoke_tool.py"),
            tool,
        ],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
        env=env,
        cwd=repo_root,
    )


def test_openclaw_wrapper_round_trip(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    store = tmp_path / "store.json"
    seed_store(store)

    env = os.environ.copy()
    env.update(
        {
            "TM_LOCAL_STORE": str(store),
            "TM_UPDATED_BY": "ai",
            "TM_SKILLS_ALLOWLIST": str(repo_root / "apps" / "cli" / "src" / "concentray_cli" / "skills" / "skills.yaml"),
            "PYTHONPATH": str(repo_root / "apps" / "cli" / "src"),
        }
    )

    claim = invoke_tool(repo_root, env, "task_claim_next", {"worker_id": "openclaw:autonomous:test:main"})
    assert claim.returncode == 0, claim.stderr
    claim_payload = json.loads(claim.stdout)
    assert claim_payload["task"]["id"] == "task-wrapper-1"
    assert claim_payload["active_run"]["worker_id"] == "openclaw:autonomous:test:main"

    heartbeat = invoke_tool(repo_root, env, "task_heartbeat", {"task_id": "task-wrapper-1", "worker_id": "openclaw:autonomous:test:main"})
    assert heartbeat.returncode == 0, heartbeat.stderr
    heartbeat_payload = json.loads(heartbeat.stdout)
    assert heartbeat_payload["active_run"]["worker_id"] == "openclaw:autonomous:test:main"

    activity = invoke_tool(
        repo_root,
        env,
        "activity_add",
        {
            "task_id": "task-wrapper-1",
            "kind": "tool_call",
            "summary": "Ran migration preflight.",
            "payload": {"tool": "npm", "step": "typecheck"},
            "worker_id": "openclaw:autonomous:test:main",
        },
    )
    assert activity.returncode == 0, activity.stderr
    activity_payload = json.loads(activity.stdout)
    assert activity_payload["activity"]["kind"] == "tool_call"

    update = invoke_tool(
        repo_root,
        env,
        "task_update",
        {
            "task_id": "task-wrapper-1",
            "status": "blocked",
            "assignee": "human",
            "input_request": {
                "schema_version": "1.0",
                "request_id": "req-1",
                "type": "choice",
                "prompt": "Approve the clean break?",
                "required": True,
                "created_at": "2026-03-03T10:00:00+00:00",
                "options": ["approve", "reject"],
            },
            "worker_id": "openclaw:autonomous:test:main",
        },
    )
    assert update.returncode == 0, update.stderr
    update_payload = json.loads(update.stdout)
    assert update_payload["task"]["status"] == "blocked"
    assert update_payload["active_run"] is None

    task_get = invoke_tool(repo_root, env, "task_get", {"task_id": "task-wrapper-1"})
    assert task_get.returncode == 0, task_get.stderr
    task_payload = json.loads(task_get.stdout)
    assert task_payload["task"]["status"] == "blocked"
    assert any(entry["kind"] == "tool_call" for entry in task_payload["activity"])

    context = invoke_tool(repo_root, env, "context_export", {"task_id": "task-wrapper-1", "format": "json"})
    assert context.returncode == 0, context.stderr
    context_payload = json.loads(context.stdout)
    assert context_payload["context"]["task"]["id"] == "task-wrapper-1"


def test_openclaw_wrapper_rejects_invalid_payload(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    store = tmp_path / "store.json"
    seed_store(store)

    env = os.environ.copy()
    env.update(
        {
            "TM_LOCAL_STORE": str(store),
            "TM_UPDATED_BY": "ai",
            "TM_SKILLS_ALLOWLIST": str(repo_root / "apps" / "cli" / "src" / "concentray_cli" / "skills" / "skills.yaml"),
            "PYTHONPATH": str(repo_root / "apps" / "cli" / "src"),
        }
    )

    result = invoke_tool(repo_root, env, "task_claim_next", {"runtime": "robot"})
    assert result.returncode != 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
