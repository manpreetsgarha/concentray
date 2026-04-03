from concentray_cli.models import Store, normalize_attachment_metadata, normalize_input_request


def test_normalizers_convert_naive_timestamps_to_explicit_utc_offsets() -> None:
    input_request = normalize_input_request(
        {
            "schema_version": "1.0",
            "request_id": "req-1",
            "type": "text_input",
            "prompt": "Share status",
            "required": True,
            "created_at": "2026-03-03T10:00:00",
            "expires_at": "2026-03-03T10:30:00",
            "multiline": False,
        }
    )
    attachment = normalize_attachment_metadata(
        {
            "kind": "file",
            "filename": "brief.txt",
            "uploaded_at": "2026-03-03T10:00:00",
        }
    )

    assert input_request is not None
    assert input_request["created_at"] == "2026-03-03T10:00:00+00:00"
    assert input_request["expires_at"] == "2026-03-03T10:30:00+00:00"
    assert attachment is not None
    assert attachment["uploaded_at"] == "2026-03-03T10:00:00+00:00"


def test_store_model_normalizes_loaded_naive_timestamps() -> None:
    store = Store.model_validate(
        {
            "schema_version": "1.0",
            "tasks": [
                {
                    "id": "task-1",
                    "title": "Normalize timestamps",
                    "status": "blocked",
                    "assignee": "human",
                    "target_runtime": None,
                    "execution_mode": "session",
                    "ai_urgency": 3,
                    "context_link": None,
                    "input_request": {
                        "schema_version": "1.0",
                        "request_id": "req-1",
                        "type": "file_or_photo",
                        "prompt": "Upload the requested file.",
                        "required": True,
                        "created_at": "2026-03-03T10:00:00",
                        "accept": ["text/plain"],
                        "max_files": 1,
                        "max_size_mb": 10,
                        "capture": False,
                    },
                    "input_response": {
                        "type": "file_or_photo",
                        "files": [
                            {
                                "kind": "file",
                                "filename": "brief.txt",
                                "uploaded_at": "2026-03-03T10:05:00",
                            }
                        ],
                    },
                    "active_run_id": "run-1",
                    "check_in_requested_at": "2026-03-03T10:10:00",
                    "check_in_requested_by": "human",
                    "created_at": "2026-03-03T10:00:00",
                    "updated_at": "2026-03-03T10:15:00",
                    "updated_by": "human",
                }
            ],
            "notes": [
                {
                    "id": "note-1",
                    "task_id": "task-1",
                    "author": "human",
                    "kind": "attachment",
                    "content": "Uploaded the requested file.",
                    "attachment": {
                        "kind": "file",
                        "filename": "brief.txt",
                        "uploaded_at": "2026-03-03T10:05:00",
                    },
                    "created_at": "2026-03-03T10:05:00",
                }
            ],
            "runs": [
                {
                    "id": "run-1",
                    "task_id": "task-1",
                    "runtime": "openclaw",
                    "worker_id": "openclaw:autonomous:test:main",
                    "status": "active",
                    "started_at": "2026-03-03T10:00:00",
                    "last_heartbeat_at": "2026-03-03T10:12:00",
                    "ended_at": None,
                    "lease_seconds": 600,
                    "end_reason": None,
                }
            ],
            "activity": [
                {
                    "id": "activity-1",
                    "task_id": "task-1",
                    "run_id": "run-1",
                    "runtime": "openclaw",
                    "actor": "human",
                    "kind": "note_added",
                    "summary": "Uploaded the requested file.",
                    "payload": None,
                    "created_at": "2026-03-03T10:05:00",
                }
            ],
        }
    )

    task = store.tasks[0]
    note = store.notes[0]
    run = store.runs[0]
    activity = store.activity[0]

    assert task.created_at == "2026-03-03T10:00:00+00:00"
    assert task.updated_at == "2026-03-03T10:15:00+00:00"
    assert task.check_in_requested_at == "2026-03-03T10:10:00+00:00"
    assert task.input_request is not None
    assert task.input_request["created_at"] == "2026-03-03T10:00:00+00:00"
    assert task.input_response is not None
    assert task.input_response["files"][0]["uploaded_at"] == "2026-03-03T10:05:00+00:00"
    assert note.created_at == "2026-03-03T10:05:00+00:00"
    assert note.attachment is not None
    assert note.attachment["uploaded_at"] == "2026-03-03T10:05:00+00:00"
    assert run.started_at == "2026-03-03T10:00:00+00:00"
    assert run.last_heartbeat_at == "2026-03-03T10:12:00+00:00"
    assert activity.created_at == "2026-03-03T10:05:00+00:00"
