import json
import socket
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
    with urllib.request.urlopen(request, timeout=5) as response:
        body = response.read()
        return response.status, json.loads(body.decode("utf-8")) if body else {}


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


def test_local_api_file_upload_and_download_round_trip(tmp_path: Path, monkeypatch) -> None:
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
            {"title": "Upload proof", "assignee": "human", "updated_by": "human"},
        )
        task_id = created["task"]["id"]

        status, upload_payload = _request(
            base_url,
            "POST",
            "/files",
            {
                "task_id": task_id,
                "filename": "proof.txt",
                "mime_type": "text/plain",
                "data_base64": "cHJvb2Ygb2Ygd29yaw==",
            },
        )
        assert status == 201
        download_link = str(upload_payload["file"]["download_link"])
        assert upload_payload["file"]["preview_text"] == "proof of work"

        with urllib.request.urlopen(download_link, timeout=5) as response:
            assert response.status == 200
            assert response.read() == b"proof of work"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_returns_json_errors_for_bad_requests(tmp_path: Path, monkeypatch) -> None:
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
        _request(base_url, "POST", "/tasks", {"title": "Guard bad requests", "assignee": "ai", "updated_by": "human"})

        try:
            bad_json_request = urllib.request.Request(
                f"{base_url}/tasks",
                data=b"{bad json",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(bad_json_request, timeout=5)
            assert False, "Expected malformed JSON to fail"
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            assert exc.code == 400
            assert payload["ok"] is False
            assert "invalid json body" in payload["error"].lower()

        try:
            urllib.request.urlopen(f"{base_url}/tasks?status=bogus", timeout=5)
            assert False, "Expected invalid enum filter to fail"
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            assert exc.code == 400
            assert payload["ok"] is False
            assert "status must be one of" in payload["error"].lower()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_rejects_oversized_json_bodies(tmp_path: Path, monkeypatch) -> None:
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

    try:
        with socket.create_connection(("127.0.0.1", server.server_address[1]), timeout=5) as client:
            client.sendall(
                (
                    "POST /tasks HTTP/1.1\r\n"
                    f"Host: 127.0.0.1:{server.server_address[1]}\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {1024 * 1024 + 1}\r\n"
                    "Connection: close\r\n\r\n"
                ).encode("utf-8")
            )
            chunks: list[bytes] = []
            while True:
                chunk = client.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)
            raw_response = b"".join(chunks).decode("utf-8")

        assert "413" in raw_response.splitlines()[0]
        assert "Request body exceeds limit" in raw_response
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_blocks_symlink_file_escape(tmp_path: Path, monkeypatch) -> None:
    workspace_config = tmp_path / "workspaces.json"
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(workspace_config))

    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    protected_file = tmp_path / "outside.txt"
    protected_file.write_text("private")
    (uploads_dir / "escape.txt").symlink_to(protected_file)

    server = make_server(
        host="127.0.0.1",
        port=0,
        uploads_dir=uploads_dir,
        provider_factory=make_provider,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        try:
            urllib.request.urlopen(f"{base_url}/files/escape.txt", timeout=5)
            assert False, "Expected symlink escape to fail"
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            assert exc.code == 400
            assert payload["ok"] is False
            assert "invalid file path" in payload["error"].lower()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_returns_404_for_missing_uploaded_file(tmp_path: Path, monkeypatch) -> None:
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
        try:
            urllib.request.urlopen(f"{base_url}/files/missing.txt", timeout=5)
            assert False, "Expected missing file lookup to fail"
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode("utf-8"))
            assert exc.code == 404
            assert payload["ok"] is False
            assert payload["error"] == "File not found"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_add_workspace_canonicalizes_relative_store_path(tmp_path: Path, monkeypatch) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    workspace_config = tmp_path / "workspaces.json"
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(workspace_config))
    monkeypatch.setenv("TM_PROJECT_ROOT", str(repo_root))
    monkeypatch.chdir(tmp_path)

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
        status, payload = _request(
            base_url,
            "POST",
            "/workspaces",
            {"name": "default", "store": ".data/default.json", "set_active": True},
        )
        assert status == 201
        assert payload["selected_workspace"]["store"] == str(repo_root / ".data" / "default.json")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_respond_endpoint_unblocks_task(tmp_path: Path, monkeypatch) -> None:
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
            {
                "title": "Wait for approval",
                "assignee": "human",
                "status": "blocked",
                "updated_by": "human",
                "input_request": {
                    "schema_version": "1.0",
                    "request_id": "req-1",
                    "type": "approve_reject",
                    "prompt": "Ship the release?",
                    "required": True,
                    "created_at": "2026-03-03T10:00:00+00:00",
                    "approve_label": "Ship",
                    "reject_label": "Hold",
                },
            },
        )
        task_id = created["task"]["id"]

        status, responded = _request(
            base_url,
            "POST",
            f"/tasks/{task_id}/respond",
            {"updated_by": "human", "response": {"type": "approve_reject", "approved": True}},
        )
        assert status == 200
        assert responded["task"]["status"] == "pending"
        assert responded["task"]["assignee"] == "ai"
        assert responded["task"]["input_request"] is None
        assert responded["task"]["input_response"]["approved"] is True
        assert responded["active_run"] is None
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_local_api_delete_returns_204_no_content(tmp_path: Path, monkeypatch) -> None:
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
            {"title": "Delete me", "assignee": "human", "updated_by": "human"},
        )

        status, payload = _request(base_url, "DELETE", f"/tasks/{created['task']['id']}")
        assert status == 204
        assert payload == {}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
