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


def test_local_api_claim_heartbeat_and_activity_flow(tmp_path: Path, monkeypatch) -> None:
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
        store = tmp_path / "default.json"
        status, _ = _request(base_url, "POST", "/workspaces", {"name": "default", "store": str(store), "set_active": True})
        assert status == 201

        status, created = _request(
            base_url,
            "POST",
            "/tasks",
            {
                "title": "Implement lease-aware runner",
                "assignee": "ai",
                "target_runtime": "openclaw",
                "execution_mode": "autonomous",
                "ai_urgency": 5,
                "updated_by": "human",
            },
        )
        assert status == 201
        task_id = created["task"]["id"]

        status, claimed = _request(
            base_url,
            "POST",
            "/tasks/claim-next",
            {"runtime": "openclaw", "worker_id": "openclaw:autonomous:test:main"},
        )
        assert status == 200
        assert claimed["task"]["id"] == task_id

        status, check_in = _request(base_url, "POST", f"/tasks/{task_id}/check-in-request", {"requested_by": "human"})
        assert status == 201
        assert check_in["pending_check_in"]["requested_by"] == "human"

        status, heartbeat = _request(
            base_url,
            "POST",
            f"/tasks/{task_id}/heartbeat",
            {"runtime": "openclaw", "worker_id": "openclaw:autonomous:test:main"},
        )
        assert status == 200
        assert heartbeat["pending_check_in"]["requested_by"] == "human"

        status, _ = _request(
            base_url,
            "POST",
            f"/tasks/{task_id}/activity",
            {
                "actor": "ai",
                "kind": "check_in_reply",
                "summary": "Still working through the migration plan.",
                "runtime": "openclaw",
                "worker_id": "openclaw:autonomous:test:main",
                "clear_check_in": True,
            },
        )
        assert status == 201

        status, task_payload = _request(base_url, "GET", f"/tasks/{task_id}")
        assert status == 200
        assert task_payload["pending_check_in"] is None

        status, activity_payload = _request(base_url, "GET", f"/tasks/{task_id}/activity")
        assert status == 200
        assert any(entry["kind"] == "check_in_reply" for entry in activity_payload["activity"])
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_rejects_wrong_worker_update(tmp_path: Path, monkeypatch) -> None:
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
        store = tmp_path / "default.json"
        _request(base_url, "POST", "/workspaces", {"name": "default", "store": str(store), "set_active": True})
        _, created = _request(
            base_url,
            "POST",
            "/tasks",
            {"title": "Guard leases", "assignee": "ai", "target_runtime": "openclaw", "updated_by": "human"},
        )
        task_id = created["task"]["id"]
        _request(base_url, "POST", "/tasks/claim-next", {"runtime": "openclaw", "worker_id": "openclaw:autonomous:test:main"})

        try:
            _request(
                base_url,
                "PATCH",
                f"/tasks/{task_id}",
                {
                    "status": "done",
                    "updated_by": "ai",
                    "runtime": "openclaw",
                    "worker_id": "openclaw:autonomous:test:other",
                },
            )
            assert False, "Expected wrong worker update to fail"
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            assert exc.code == 400
            assert "leased by" in payload["error"].lower()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_notes_round_trip_and_emit_activity(tmp_path: Path, monkeypatch) -> None:
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
        store = tmp_path / "default.json"
        _request(base_url, "POST", "/workspaces", {"name": "default", "store": str(store), "set_active": True})
        _, created = _request(
            base_url,
            "POST",
            "/tasks",
            {"title": "Capture operator notes", "assignee": "human", "updated_by": "human"},
        )
        task_id = created["task"]["id"]

        status, note_payload = _request(
            base_url,
            "POST",
            f"/tasks/{task_id}/notes",
            {
                "author": "human",
                "kind": "attachment",
                "content": "Added the approval screenshot.",
                "attachment": {"filename": "approval.png"},
            },
        )
        assert status == 201
        assert note_payload["note"]["kind"] == "attachment"

        status, notes_payload = _request(base_url, "GET", f"/tasks/{task_id}/notes")
        assert status == 200
        assert len(notes_payload["notes"]) == 1
        assert notes_payload["notes"][0]["attachment"]["filename"] == "approval.png"

        status, activity_payload = _request(base_url, "GET", f"/tasks/{task_id}/activity")
        assert status == 200
        assert any(entry["kind"] == "note_added" for entry in activity_payload["activity"])
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
