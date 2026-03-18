import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

from concentray_cli.local_api_server import make_server
from concentray_cli.provider_factory import make_provider


def _request(base_url: str, method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def test_local_api_workspace_switch_isolates_tasks(tmp_path: Path, monkeypatch) -> None:
    workspace_config = tmp_path / "workspaces.json"
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(workspace_config))

    server = make_server(
        host="127.0.0.1",
        port=0,
        uploads_dir=tmp_path / "uploads",
        provider_factory=make_provider,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        default_store = tmp_path / "default.json"
        fitness_store = tmp_path / "fitness.json"

        status, payload = _request(
            base_url,
            "POST",
            "/workspaces",
            {"name": "default", "store": str(default_store), "set_active": True},
        )
        assert status == 201
        assert payload["active_workspace"] == "default"

        status, payload = _request(
            base_url,
            "POST",
            "/tasks",
            {"title": "Ship workspace UI", "created_by": "Human", "assignee": "AI", "ai_urgency": 4},
        )
        assert status == 201
        assert payload["task"]["Title"] == "Ship workspace UI"

        status, payload = _request(base_url, "GET", "/tasks")
        assert status == 200
        assert len(payload["tasks"]) == 1

        status, payload = _request(
            base_url,
            "POST",
            "/workspaces",
            {"name": "fitness", "store": str(fitness_store), "set_active": True},
        )
        assert status == 201
        assert payload["active_workspace"] == "fitness"

        status, payload = _request(base_url, "GET", "/tasks")
        assert status == 200
        assert payload["tasks"] == []

        status, payload = _request(base_url, "PATCH", "/workspaces/active", {"name": "default"})
        assert status == 200
        assert payload["active_workspace"] == "default"

        status, payload = _request(base_url, "GET", "/tasks")
        assert status == 200
        assert len(payload["tasks"]) == 1
        assert payload["tasks"][0]["Title"] == "Ship workspace UI"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_workspace_delete_reassigns_active_and_rejects_last(tmp_path: Path, monkeypatch) -> None:
    workspace_config = tmp_path / "workspaces.json"
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(workspace_config))

    server = make_server(
        host="127.0.0.1",
        port=0,
        uploads_dir=tmp_path / "uploads",
        provider_factory=make_provider,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        default_store = tmp_path / "default.json"
        second_store = tmp_path / "fitness.json"

        status, payload = _request(
            base_url,
            "POST",
            "/workspaces",
            {"name": "default", "store": str(default_store), "set_active": True},
        )
        assert status == 201
        assert payload["active_workspace"] == "default"

        status, payload = _request(
            base_url,
            "POST",
            "/workspaces",
            {"name": "fitness", "store": str(second_store), "set_active": True},
        )
        assert status == 201
        assert payload["active_workspace"] == "fitness"

        status, payload = _request(base_url, "DELETE", "/workspaces/fitness")
        assert status == 200
        assert payload["active_workspace"] == "default"
        assert [workspace["name"] for workspace in payload["workspaces"]] == ["default"]

        try:
            _request(base_url, "DELETE", "/workspaces/default")
            assert False, "Expected delete of last workspace to fail"
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            assert exc.code == 400
            assert payload["error"] == "Cannot remove the last workspace"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_task_delete_hides_task_and_thread(tmp_path: Path, monkeypatch) -> None:
    workspace_config = tmp_path / "workspaces.json"
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(workspace_config))

    server = make_server(
        host="127.0.0.1",
        port=0,
        uploads_dir=tmp_path / "uploads",
        provider_factory=make_provider,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        default_store = tmp_path / "default.json"

        status, payload = _request(
            base_url,
            "POST",
            "/workspaces",
            {"name": "default", "store": str(default_store), "set_active": True},
        )
        assert status == 201

        status, payload = _request(
            base_url,
            "POST",
            "/tasks",
            {"title": "Delete me", "created_by": "Human", "assignee": "AI", "ai_urgency": 3},
        )
        assert status == 201
        task_id = payload["task"]["Task_ID"]

        status, payload = _request(
            base_url,
            "POST",
            f"/tasks/{task_id}/comments",
            {"author": "AI", "type": "log", "message": "transient trace"},
        )
        assert status == 201

        status, payload = _request(base_url, "DELETE", f"/tasks/{task_id}")
        assert status == 200
        assert payload["task"]["Deleted_At"] is not None

        status, payload = _request(base_url, "GET", "/tasks")
        assert status == 200
        assert payload["tasks"] == []

        try:
            _request(base_url, "GET", f"/tasks/{task_id}")
            assert False, "Expected deleted task to be hidden"
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            assert exc.code == 404
            assert "not found" in payload["error"].lower()

        saved = json.loads(default_store.read_text())
        assert saved["tasks"][0]["Deleted_At"] is not None
        assert saved["comments"][0]["Deleted_At"] is not None
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_claim_next_respects_execution_mode(tmp_path: Path, monkeypatch) -> None:
    workspace_config = tmp_path / "workspaces.json"
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(workspace_config))

    server = make_server(
        host="127.0.0.1",
        port=0,
        uploads_dir=tmp_path / "uploads",
        provider_factory=make_provider,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        default_store = tmp_path / "default.json"

        status, _ = _request(
            base_url,
            "POST",
            "/workspaces",
            {"name": "default", "store": str(default_store), "set_active": True},
        )
        assert status == 201

        status, payload = _request(
            base_url,
            "POST",
            "/tasks",
            {
                "title": "Guided task",
                "created_by": "Human",
                "assignee": "AI",
                "execution_mode": "session",
                "ai_urgency": 4,
            },
        )
        assert status == 201
        assert payload["task"]["Execution_Mode"] == "Session"

        status, payload = _request(
            base_url,
            "POST",
            "/tasks/claim-next",
            {"worker_id": "openclaw-main", "assignee": "ai", "status": ["pending", "in_progress"]},
        )
        assert status == 200
        assert payload["task"] is None

        status, payload = _request(
            base_url,
            "POST",
            "/tasks/claim-next",
            {
                "worker_id": "codex-main",
                "assignee": "ai",
                "status": ["pending", "in_progress"],
                "execution_mode": ["session"],
            },
        )
        assert status == 200
        assert payload["task"]["Title"] == "Guided task"
        assert payload["task"]["Execution_Mode"] == "Session"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
