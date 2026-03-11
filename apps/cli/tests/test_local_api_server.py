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
