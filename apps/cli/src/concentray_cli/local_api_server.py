from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse
from uuid import uuid4

from concentray_cli.context import build_context_envelope
from concentray_cli.models import Actor, Comment, CommentType, Task, TaskExecutionMode, TaskStatus, UpdatedBy, iso_now
from concentray_cli.providers.base import Provider
from concentray_cli.providers.local_json import LocalJsonProvider
from concentray_cli.workspace_store import (
    get_selected_workspace,
    load_workspace_config,
    save_workspace_config,
    suggested_workspace_store,
)


def _status_from_wire(raw: str) -> TaskStatus:
    mapping = {
        "pending": TaskStatus.PENDING,
        "in_progress": TaskStatus.IN_PROGRESS,
        "blocked": TaskStatus.BLOCKED,
        "done": TaskStatus.DONE,
        "Pending": TaskStatus.PENDING,
        "In Progress": TaskStatus.IN_PROGRESS,
        "Blocked": TaskStatus.BLOCKED,
        "Done": TaskStatus.DONE,
    }
    if raw not in mapping:
        raise ValueError(f"Invalid status: {raw}")
    return mapping[raw]


def _actor_from_wire(raw: str) -> Actor:
    mapping = {
        "ai": Actor.AI,
        "human": Actor.HUMAN,
        "AI": Actor.AI,
        "Human": Actor.HUMAN,
    }
    if raw not in mapping:
        raise ValueError(f"Invalid actor: {raw}")
    return mapping[raw]


def _execution_mode_from_wire(raw: str) -> TaskExecutionMode:
    mapping = {
        "autonomous": TaskExecutionMode.AUTONOMOUS,
        "session": TaskExecutionMode.SESSION,
        "Autonomous": TaskExecutionMode.AUTONOMOUS,
        "Session": TaskExecutionMode.SESSION,
    }
    if raw not in mapping:
        raise ValueError(f"Invalid execution mode: {raw}")
    return mapping[raw]


def _updated_by_from_wire(raw: str) -> UpdatedBy:
    mapping = {
        "ai": UpdatedBy.AI,
        "human": UpdatedBy.HUMAN,
        "system": UpdatedBy.SYSTEM,
        "AI": UpdatedBy.AI,
        "Human": UpdatedBy.HUMAN,
        "System": UpdatedBy.SYSTEM,
    }
    if raw not in mapping:
        raise ValueError(f"Invalid updated_by: {raw}")
    return mapping[raw]


def _infer_kind(mime_type: str, filename: str) -> str:
    lowered = mime_type.lower()
    if lowered.startswith("image/"):
        return "image"
    if lowered.startswith("video/"):
        return "video"
    if lowered == "text/csv" or filename.lower().endswith(".csv"):
        return "csv"
    if lowered.startswith("text/"):
        return "text"
    return "file"


def _normalize_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def _is_allowed_upload(mime_type: str, filename: str) -> bool:
    lowered = mime_type.lower()
    ext = _normalize_extension(filename)

    if lowered.startswith("image/") or lowered.startswith("video/"):
        return True
    if lowered in {"text/plain", "text/csv"}:
        return True
    if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".mp4", ".mov", ".m4v", ".webm", ".txt", ".csv"}:
        return True
    return False


def _max_upload_bytes() -> int:
    raw = os.getenv("TM_LOCAL_MAX_UPLOAD_MB", "25").strip()
    try:
        mb = int(raw)
    except ValueError:
        mb = 25
    if mb < 1:
        mb = 1
    return mb * 1024 * 1024


def _build_preview_text(content: bytes, kind: str) -> Optional[str]:
    if kind not in {"text", "csv"}:
        return None

    try:
        decoded = content.decode("utf-8", errors="replace")
    except Exception:
        return None

    snippet = decoded[:2000]
    lines = snippet.splitlines()
    if len(lines) > 20:
        lines = lines[:20]
        return "\n".join(lines) + "\n..."
    return "\n".join(lines)


class LocalApiRuntime:
    def __init__(self, provider_factory: Callable[[], Provider]):
        self._provider_factory = provider_factory

    def provider(self) -> Provider:
        return self._provider_factory()

    def workspace_payload(self) -> Dict[str, Any]:
        payload = load_workspace_config()
        selected = get_selected_workspace(payload)
        workspaces = payload.get("workspaces") or {}
        workspace_rows = []
        for name in sorted(workspaces.keys()):
            record = workspaces.get(name) or {}
            workspace_rows.append(
                {
                    "name": name,
                    "provider": record.get("provider"),
                    "store": record.get("store"),
                    "active": name == payload.get("active_workspace"),
                }
            )

        return {
            "ok": True,
            "workspaces": workspace_rows,
            "active_workspace": payload.get("active_workspace"),
            "selected_workspace": selected,
        }

    def add_workspace(self, name: str, store: Optional[str], set_active: bool = True) -> Dict[str, Any]:
        workspace_name = name.strip()
        if not workspace_name:
            raise ValueError("Workspace name is required")

        store_path = Path(store).expanduser() if store else suggested_workspace_store(workspace_name)
        LocalJsonProvider(store_path).list_tasks()

        payload = load_workspace_config()
        workspaces = payload.get("workspaces") or {}
        workspaces[workspace_name] = {
            "provider": "local_json",
            "store": str(store_path),
        }
        payload["workspaces"] = workspaces
        if set_active or not payload.get("active_workspace"):
            payload["active_workspace"] = workspace_name
        save_workspace_config(payload)
        return self.workspace_payload()

    def set_active_workspace(self, name: str) -> Dict[str, Any]:
        payload = load_workspace_config()
        workspaces = payload.get("workspaces") or {}
        if name not in workspaces:
            raise ValueError(f"Workspace '{name}' not found")
        payload["active_workspace"] = name
        save_workspace_config(payload)
        return self.workspace_payload()

    def remove_workspace(self, name: str) -> Dict[str, Any]:
        workspace_name = name.strip()
        payload = load_workspace_config()
        workspaces = payload.get("workspaces") or {}
        if workspace_name not in workspaces:
            raise ValueError(f"Workspace '{workspace_name}' not found")
        if len(workspaces) <= 1:
            raise ValueError("Cannot remove the last workspace")

        del workspaces[workspace_name]
        payload["workspaces"] = workspaces
        if payload.get("active_workspace") == workspace_name:
            payload["active_workspace"] = sorted(workspaces.keys())[0]
        save_workspace_config(payload)
        return self.workspace_payload()


class LocalApiHandler(BaseHTTPRequestHandler):
    runtime: LocalApiRuntime
    uploads_dir: Path

    def _provider(self) -> Provider:
        return self.runtime.provider()

    def _set_headers(
        self,
        status_code: int = 200,
        content_type: str = "application/json",
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()

    def _send(self, status_code: int, payload: Dict[str, Any]) -> None:
        self._set_headers(status_code)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _read_json(self) -> Dict[str, Any]:
        size = int(self.headers.get("Content-Length", "0"))
        if size == 0:
            return {}
        data = self.rfile.read(size).decode("utf-8")
        return json.loads(data)

    def _route_task_path(self, path: str) -> Tuple[Optional[str], Optional[str]]:
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2 or parts[0] != "tasks":
            return None, None
        task_id = parts[1]
        suffix = parts[2] if len(parts) > 2 else None
        return task_id, suffix

    def _request_base_url(self) -> str:
        host = self.headers.get("Host") or f"{self.server.server_address[0]}:{self.server.server_address[1]}"
        return f"http://{host}"

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._set_headers(200)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._send(200, {"ok": True})
            return

        if path == "/workspaces":
            self._send(200, self.runtime.workspace_payload())
            return

        if path.startswith("/files/"):
            requested_name = unquote(path.split("/files/", 1)[1])
            filename = Path(requested_name).name
            file_path = self.uploads_dir / filename
            if not file_path.exists() or not file_path.is_file():
                self._send(404, {"ok": False, "error": "File not found"})
                return

            mime_type, _ = mimetypes.guess_type(str(file_path))
            mime_type = mime_type or "application/octet-stream"
            data = file_path.read_bytes()
            self._set_headers(
                200,
                content_type=mime_type,
                extra_headers={"Content-Length": str(len(data))},
            )
            self.wfile.write(data)
            return

        if path == "/tasks":
            query = parse_qs(parsed.query)
            assignee = (query.get("assignee") or [None])[0]
            status = (query.get("status") or [None])[0]
            execution_mode = (query.get("execution_mode") or [None])[0]

            tasks = self._provider().list_tasks()
            if assignee:
                tasks = [
                    task
                    for task in tasks
                    if str(task.assignee).lower() == assignee.lower()
                    or getattr(task.assignee, "value", "").lower() == assignee.lower()
                ]
            if status:
                status_value = _status_from_wire(status).value
                tasks = [
                    task
                    for task in tasks
                    if (task.status.value if hasattr(task.status, "value") else str(task.status))
                    == status_value
                ]
            if execution_mode:
                execution_mode_value = _execution_mode_from_wire(execution_mode).value
                tasks = [
                    task
                    for task in tasks
                    if (task.execution_mode.value if hasattr(task.execution_mode, "value") else str(task.execution_mode))
                    == execution_mode_value
                ]

            self._send(200, {"ok": True, "tasks": [task.model_dump(by_alias=True) for task in tasks]})
            return

        if path.startswith("/tasks/"):
            task_id, suffix = self._route_task_path(path)
            if not task_id:
                self._send(404, {"ok": False, "error": "Not found"})
                return

            task = self._provider().get_task(task_id)
            if not task:
                self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
                return

            if suffix == "comments":
                comments = self._provider().list_comments(task_id)
                self._send(
                    200,
                    {"ok": True, "comments": [comment.model_dump(by_alias=True) for comment in comments]},
                )
                return

            if suffix is None:
                self._send(200, {"ok": True, "task": task.model_dump(by_alias=True)})
                return

            self._send(404, {"ok": False, "error": "Not found"})
            return

        if path.startswith("/context/"):
            task_id = path.split("/")[-1]
            task = self._provider().get_task(task_id)
            if not task:
                self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
                return
            comments = self._provider().list_comments(task_id)
            envelope = build_context_envelope(task, comments)
            self._send(200, {"ok": True, "context": envelope})
            return

        self._send(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self._read_json()

        if path == "/workspaces":
            try:
                response = self.runtime.add_workspace(
                    name=str(payload.get("name", "")),
                    store=str(payload.get("store", "")).strip() or None,
                    set_active=bool(payload.get("set_active", True)),
                )
            except ValueError as exc:
                self._send(400, {"ok": False, "error": str(exc)})
                return

            self._send(201, response)
            return

        if path == "/files":
            task_id = str(payload.get("task_id", "")).strip()
            if not task_id:
                self._send(400, {"ok": False, "error": "task_id is required"})
                return
            if not self._provider().get_task(task_id):
                self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
                return

            filename = str(payload.get("filename", "")).strip()
            if not filename:
                self._send(400, {"ok": False, "error": "filename is required"})
                return

            data_base64 = str(payload.get("data_base64", "")).strip()
            if not data_base64:
                self._send(400, {"ok": False, "error": "data_base64 is required"})
                return

            safe_name = Path(filename).name
            ext = Path(safe_name).suffix
            stored_name = f"{uuid4().hex}{ext}"
            mime_type = str(payload.get("mime_type", "")).strip() or (
                mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
            )

            try:
                raw_bytes = base64.b64decode(data_base64, validate=True)
            except Exception:
                self._send(400, {"ok": False, "error": "Invalid base64 payload"})
                return

            if not _is_allowed_upload(mime_type, safe_name):
                self._send(
                    400,
                    {
                        "ok": False,
                        "error": "Unsupported file type. Allowed: images, videos, .txt, .csv",
                    },
                )
                return

            max_bytes = _max_upload_bytes()
            if len(raw_bytes) > max_bytes:
                self._send(
                    413,
                    {
                        "ok": False,
                        "error": f"File exceeds limit of {max_bytes // (1024 * 1024)} MB",
                    },
                )
                return

            self.uploads_dir.mkdir(parents=True, exist_ok=True)
            out_path = self.uploads_dir / stored_name
            out_path.write_bytes(raw_bytes)

            base_url = self._request_base_url()
            kind = _infer_kind(mime_type, safe_name)
            preview_text = _build_preview_text(raw_bytes, kind)
            file_payload = {
                "task_id": task_id,
                "kind": kind,
                "filename": safe_name,
                "mime_type": mime_type,
                "size_bytes": len(raw_bytes),
                "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                "uploaded_at": iso_now(),
                "preview_link": f"{base_url}/files/{stored_name}",
                "download_link": f"{base_url}/files/{stored_name}",
                "preview_text": preview_text,
            }

            self._send(201, {"ok": True, "file": file_payload})
            return

        if path == "/tasks":
            now = iso_now()
            created_by = _actor_from_wire(str(payload.get("created_by", "Human")))
            assignee = _actor_from_wire(str(payload.get("assignee", "AI")))
            raw_execution_mode = payload.get("execution_mode")
            execution_mode = (
                _execution_mode_from_wire(str(raw_execution_mode))
                if raw_execution_mode is not None
                else (TaskExecutionMode.AUTONOMOUS if assignee == Actor.AI else TaskExecutionMode.SESSION)
            )
            title = str(payload.get("title", "Untitled Task")).strip() or "Untitled Task"

            task = Task(
                Title=title,
                Status=TaskStatus.PENDING,
                Created_By=created_by,
                Assignee=assignee,
                Execution_Mode=execution_mode,
                Context_Link=payload.get("context_link"),
                AI_Urgency=int(payload.get("ai_urgency", 3)),
                Input_Request=None,
                Input_Request_Version=None,
                Input_Response=None,
                Updated_By=UpdatedBy.HUMAN,
                Field_Clock={
                    "title": now,
                    "status": now,
                    "assignee": now,
                    "created_by": now,
                    "execution_mode": now,
                },
            )
            self._provider().upsert_task(task)
            self._send(201, {"ok": True, "task": task.model_dump(by_alias=True)})
            return

        if path == "/tasks/claim-next":
            try:
                claimed = self._provider().claim_next_task(
                    worker_id=str(payload.get("worker_id", "")).strip(),
                    assignee=str(payload.get("assignee", "ai")),
                    statuses=[_status_from_wire(item) for item in payload.get("status", ["pending", "in_progress"])],
                    execution_modes=[
                        _execution_mode_from_wire(item)
                        for item in payload.get("execution_mode", ["autonomous"])
                    ],
                    updated_by=_updated_by_from_wire(str(payload.get("updated_by", "AI"))),
                    lease_seconds=int(payload.get("lease_seconds", 1800)),
                )
            except (ValueError, TypeError) as exc:
                self._send(400, {"ok": False, "error": str(exc)})
                return

            self._send(200, {"ok": True, "task": claimed.model_dump(by_alias=True) if claimed else None})
            return

        if path.startswith("/tasks/"):
            task_id, suffix = self._route_task_path(path)
            if not task_id or suffix != "comments":
                self._send(404, {"ok": False, "error": "Not found"})
                return

            task = self._provider().get_task(task_id)
            if not task:
                self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
                return

            type_mapping = {
                "message": CommentType.MESSAGE,
                "log": CommentType.LOG,
                "decision": CommentType.DECISION,
                "attachment": CommentType.ATTACHMENT,
            }
            raw_type = str(payload.get("type", "message")).lower()
            if raw_type not in type_mapping:
                self._send(400, {"ok": False, "error": "Invalid comment type"})
                return

            author = _actor_from_wire(str(payload.get("author", "Human")))
            comment = Comment(
                Task_ID=task_id,
                Author=author,
                Message=str(payload.get("message", "")),
                Type=type_mapping[raw_type],
                Attachment_Link=payload.get("attachment_link"),
                Metadata=payload.get("metadata"),
            )
            self._provider().add_comment(comment)
            self._send(201, {"ok": True, "comment": comment.model_dump(by_alias=True)})
            return

        self._send(404, {"ok": False, "error": "Not found"})

    def do_PATCH(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/workspaces/active":
            patch = self._read_json()
            try:
                response = self.runtime.set_active_workspace(str(patch.get("name", "")).strip())
            except ValueError as exc:
                self._send(400, {"ok": False, "error": str(exc)})
                return
            self._send(200, response)
            return

        if not path.startswith("/tasks/"):
            self._send(404, {"ok": False, "error": "Not found"})
            return

        task_id, suffix = self._route_task_path(path)
        if not task_id or suffix is not None:
            self._send(404, {"ok": False, "error": "Not found"})
            return

        task = self._provider().get_task(task_id)
        if not task:
            self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
            return

        patch = self._read_json()
        now = iso_now()

        updates: Dict[str, Any] = {
            "updated_at": now,
            "updated_by": UpdatedBy.HUMAN,
            "version": task.version + 1,
            "field_clock": dict(task.field_clock),
        }

        if "title" in patch and patch["title"] is not None:
            title = str(patch["title"]).strip()
            if not title:
                self._send(400, {"ok": False, "error": "title cannot be empty"})
                return
            updates["title"] = title
            updates["field_clock"]["title"] = now

        if "status" in patch and patch["status"] is not None:
            updates["status"] = _status_from_wire(str(patch["status"]))
            updates["field_clock"]["status"] = now

        if "created_by" in patch and patch["created_by"] is not None:
            updates["created_by"] = _actor_from_wire(str(patch["created_by"]))
            updates["field_clock"]["created_by"] = now

        if "assignee" in patch and patch["assignee"] is not None:
            updates["assignee"] = _actor_from_wire(str(patch["assignee"]))
            updates["field_clock"]["assignee"] = now

        if "execution_mode" in patch and patch["execution_mode"] is not None:
            updates["execution_mode"] = _execution_mode_from_wire(str(patch["execution_mode"]))
            updates["field_clock"]["execution_mode"] = now

        if "ai_urgency" in patch and patch["ai_urgency"] is not None:
            urgency = int(patch["ai_urgency"])
            if urgency < 1 or urgency > 5:
                self._send(400, {"ok": False, "error": "ai_urgency must be between 1 and 5"})
                return
            updates["ai_urgency"] = urgency
            updates["field_clock"]["ai_urgency"] = now

        if "context_link" in patch:
            raw_context_link = patch["context_link"]
            updates["context_link"] = str(raw_context_link).strip() or None if raw_context_link else None
            updates["field_clock"]["context_link"] = now

        if "input_request" in patch:
            updates["input_request"] = patch["input_request"]
            updates["input_request_version"] = (
                patch["input_request"].get("schema_version", "1.0")
                if isinstance(patch["input_request"], dict)
                else None
            )
            updates["field_clock"]["input_request"] = now
            updates["field_clock"]["input_request_version"] = now

        if "input_response" in patch:
            updates["input_response"] = patch["input_response"]
            updates["field_clock"]["input_response"] = now

        if "worker_id" in patch:
            raw_worker_id = str(patch["worker_id"]).strip() if patch["worker_id"] is not None else ""
            updates["worker_id"] = raw_worker_id or None
            updates["claimed_at"] = now if raw_worker_id else None
            updates["field_clock"]["worker_id"] = now
            updates["field_clock"]["claimed_at"] = now

        if patch.get("clear_worker"):
            updates["worker_id"] = None
            updates["claimed_at"] = None
            updates["field_clock"]["worker_id"] = now
            updates["field_clock"]["claimed_at"] = now

        next_status = updates.get("status", task.status)
        next_assignee = updates.get("assignee", task.assignee)
        if next_status != TaskStatus.IN_PROGRESS or next_assignee != Actor.AI:
            updates["worker_id"] = None
            updates["claimed_at"] = None
            updates["field_clock"]["worker_id"] = now
            updates["field_clock"]["claimed_at"] = now

        updated = task.model_copy(update=updates)
        self._provider().upsert_task(updated)
        self._send(200, {"ok": True, "task": updated.model_dump(by_alias=True)})

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/tasks/"):
            task_id, suffix = self._route_task_path(path)
            if not task_id or suffix is not None:
                self._send(404, {"ok": False, "error": "Not found"})
                return

            deleted = self._provider().delete_task(
                task_id,
                updated_by=UpdatedBy.SYSTEM,
            )
            if not deleted:
                self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
                return

            self._send(200, {"ok": True, "task": deleted.model_dump(by_alias=True)})
            return

        if path.startswith("/workspaces/"):
            workspace_name = unquote(path.split("/workspaces/", 1)[1]).strip()
            if not workspace_name:
                self._send(404, {"ok": False, "error": "Not found"})
                return
            try:
                response = self.runtime.remove_workspace(workspace_name)
            except ValueError as exc:
                self._send(400, {"ok": False, "error": str(exc)})
                return
            self._send(200, response)
            return

        self._send(404, {"ok": False, "error": "Not found"})


def make_server(
    host: str,
    port: int,
    uploads_dir: Path,
    provider: Optional[Provider] = None,
    provider_factory: Optional[Callable[[], Provider]] = None,
) -> ThreadingHTTPServer:
    if provider is None and provider_factory is None:
        raise ValueError("provider or provider_factory is required")
    runtime = LocalApiRuntime(provider_factory or (lambda: provider))

    handler_cls = type(
        "BoundLocalApiHandler",
        (LocalApiHandler,),
        {
            "runtime": runtime,
            "uploads_dir": uploads_dir,
        },
    )
    return ThreadingHTTPServer((host, port), handler_cls)


def run_local_api_server(
    provider: Optional[Provider] = None,
    provider_factory: Optional[Callable[[], Provider]] = None,
    host: str = "127.0.0.1",
    port: int = 8787,
    uploads_dir: Optional[Path] = None,
) -> None:
    target_uploads_dir = uploads_dir or Path(os.getenv("TM_LOCAL_UPLOAD_DIR", ".data/uploads"))
    target_uploads_dir.mkdir(parents=True, exist_ok=True)

    server = make_server(
        provider=provider,
        provider_factory=provider_factory,
        host=host,
        port=port,
        uploads_dir=target_uploads_dir,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
