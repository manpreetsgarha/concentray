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
                        "Task_ID": "task-wrapper-1",
                        "Title": "Wrapper test",
                        "Status": "Pending",
                        "Created_By": "Human",
                        "Assignee": "AI",
                        "Context_Link": None,
                        "AI_Urgency": 2,
                        "Input_Request": None,
                        "Input_Request_Version": None,
                        "Input_Response": None,
                        "Created_At": "2026-03-03T10:00:00+00:00",
                        "Updated_At": "2026-03-03T10:00:00+00:00",
                        "Updated_By": "Human",
                        "Version": 1,
                        "Field_Clock": {},
                        "Deleted_At": None,
                    }
                ],
                "comments": [],
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
            "TM_PROVIDER": "local_json",
            "TM_LOCAL_STORE": str(store),
            "TM_SKILLS_ALLOWLIST": str(
                repo_root / "apps" / "cli" / "src" / "concentray_cli" / "skills" / "skills.yaml"
            ),
            "TM_UPDATED_BY": "AI",
            "PYTHONPATH": str(repo_root / "apps" / "cli" / "src"),
        }
    )

    proc = invoke_tool(
        repo_root,
        env,
        "task_claim_next",
        {"worker_id": "openclaw-wrapper", "assignee": "ai", "status": ["pending", "in_progress"]},
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert payload["task"]["Task_ID"] == "task-wrapper-1"
    assert payload["task"]["Worker_ID"] == "openclaw-wrapper"
    assert payload["task"]["Claimed_At"] is not None

    proc = invoke_tool(
        repo_root,
        env,
        "task_get_next",
        {"assignee": "ai", "status": ["pending", "in_progress"], "worker_id": "other-worker"},
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert payload["task"] is None

    proc = invoke_tool(
        repo_root,
        env,
        "comment_add",
        {
            "task_id": "task-wrapper-1",
            "message": "OpenClaw wrapper comment",
            "type": "log",
            "metadata": {
                "step": "claim",
                "payload": {
                    "worker_id": "openclaw-wrapper",
                    "status": "claimed",
                },
            },
        },
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert payload["comment"]["Task_ID"] == "task-wrapper-1"
    assert payload["comment"]["Metadata"]["payload"]["status"] == "claimed"

    proc = invoke_tool(
        repo_root,
        env,
        "task_update",
        {
            "task_id": "task-wrapper-1",
            "status": "blocked",
            "assignee": "human",
            "urgency": 5,
            "input_request": {
                "schema_version": "1.0",
                "type": "choice",
                "options": ["approve", "reject"],
            },
        },
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert payload["task"]["Status"] == "Blocked"
    assert payload["task"]["Assignee"] == "Human"

    proc = invoke_tool(
        repo_root,
        env,
        "task_get",
        {"task_id": "task-wrapper-1", "with_comments": True},
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert payload["task"]["Status"] == "Blocked"
    assert len(payload["comments"]) == 1
    assert payload["comments"][0]["Message"] == "OpenClaw wrapper comment"
    assert payload["comments"][0]["Metadata"]["step"] == "claim"

    proc = invoke_tool(repo_root, env, "context_export", {"task_id": "task-wrapper-1", "format": "json"})
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert payload["context"]["task"]["Task_ID"] == "task-wrapper-1"
    assert payload["context"]["constraints"]["status"] == "Blocked"

    proc = invoke_tool(repo_root, env, "skill_run", {"skill_id": "echo_task", "task_id": "task-wrapper-1"})
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert "task-wrapper-1" in payload["stdout"]


def test_openclaw_wrapper_rejects_invalid_payload(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    store = tmp_path / "store.json"
    seed_store(store)

    env = os.environ.copy()
    env.update(
        {
            "TM_PROVIDER": "local_json",
            "TM_LOCAL_STORE": str(store),
            "TM_SKILLS_ALLOWLIST": str(
                repo_root / "apps" / "cli" / "src" / "concentray_cli" / "skills" / "skills.yaml"
            ),
            "TM_UPDATED_BY": "AI",
            "PYTHONPATH": str(repo_root / "apps" / "cli" / "src"),
        }
    )

    proc = invoke_tool(repo_root, env, "task_get_next", {"assignee": "robot", "status": ["pending"]})
    assert proc.returncode != 0
    payload = json.loads(proc.stdout)
    assert payload["ok"] is False
    assert "assignee" in payload["error"].lower()
