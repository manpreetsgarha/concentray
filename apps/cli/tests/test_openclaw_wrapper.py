import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def seed_store(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0",
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


def load_invoke_tool_module(repo_root: Path):
    spec = importlib.util.spec_from_file_location(
        "test_invoke_tool_module",
        repo_root / "openclaw" / "plugin_tools" / "invoke_tool.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load invoke_tool module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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

    first_context = invoke_tool(repo_root, env, "context_export", {"task_id": "task-wrapper-1", "format": "json"})
    assert first_context.returncode == 0, first_context.stderr
    first_context_payload = json.loads(first_context.stdout)
    assert first_context_payload["context"]["task"]["id"] == "task-wrapper-1"
    assert first_context_payload["context"]["schema_version"] == "2.0"
    assert first_context_payload["context"]["context"]["title"] == "Wrapper test"
    assert first_context_payload["context"]["input_request"]["request_id"] == "req-1"
    assert first_context_payload["context"]["input_response"] is None
    assert first_context_payload["context"]["pending_check_in"] is None
    assert first_context_payload["context"]["constraints"]["status"] == "blocked"

    deadline = time.time() + 3
    second_context_payload = first_context_payload
    while time.time() < deadline:
        second_context = invoke_tool(repo_root, env, "context_export", {"task_id": "task-wrapper-1", "format": "json"})
        assert second_context.returncode == 0, second_context.stderr
        second_context_payload = json.loads(second_context.stdout)
        if (
            first_context_payload["context"]["timestamps"]["generated_at"]
            != second_context_payload["context"]["timestamps"]["generated_at"]
        ):
            break
        time.sleep(0.1)

    assert (
        first_context_payload["context"]["timestamps"]["task_updated_at"]
        == second_context_payload["context"]["timestamps"]["task_updated_at"]
    )
    assert (
        first_context_payload["context"]["timestamps"]["generated_at"]
        != second_context_payload["context"]["timestamps"]["generated_at"]
    )


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


def test_openclaw_wrapper_default_worker_id_lowercases_hostname(monkeypatch) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    module = load_invoke_tool_module(repo_root)

    monkeypatch.delenv("OPENCLAW_WORKER_ID", raising=False)
    monkeypatch.delenv("TM_WORKER_ID", raising=False)
    monkeypatch.setattr(module.socket, "gethostname", lambda: "MacBook-Pro.local")

    assert module.default_worker_id() == "openclaw:autonomous:macbook-pro:main"


def test_openclaw_policy_allows_public_cli_entrypoint() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    allowlist = (repo_root / "openclaw" / "policy" / "allowlist.toml").read_text()

    assert '["python3", "-m", "concentray_cli.main"]' in allowlist
    assert '["python", "-m", "concentray_cli.main"]' in allowlist


def test_openclaw_wrapper_preserves_skill_args_with_commas() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    module = load_invoke_tool_module(repo_root)

    args = module.build_cli_args(
        "skill_run",
        {
            "skill_id": "echo_args",
            "task_id": "task-1",
            "args": ["first,arg", "second"],
        },
    )

    assert "--args-json" in args
    assert args[args.index("--args-json") + 1] == '["first,arg", "second"]'
