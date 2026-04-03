from __future__ import annotations

import base64
import hashlib
import json
import math
import mimetypes
import os
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse
from uuid import uuid4

from concentray_cli.context import build_context_envelope
from concentray_cli.models import (
    Assignee,
    DEFAULT_LEASE_SECONDS,
    Runtime,
    TaskExecutionMode,
    TaskStatus,
    UpdatedBy,
    iso_now,
)
from concentray_cli.paths import canonical_store_path
from concentray_cli.providers.base import Provider
from concentray_cli.providers.local_json import LocalJsonProvider
from concentray_cli.workspace_store import (
    get_selected_workspace,
    load_workspace_config,
    save_workspace_config,
    suggested_workspace_store,
)


class BadRequestError(ValueError):
    pass


class PayloadTooLargeError(BadRequestError):
    pass


DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 1024


def _status_from_wire(raw: str) -> TaskStatus:
    try:
        return TaskStatus(str(raw).strip().lower())
    except ValueError as exc:
        raise BadRequestError("status must be one of: pending, in_progress, blocked, done") from exc


def _assignee_from_wire(raw: str) -> Assignee:
    try:
        return Assignee(str(raw).strip().lower())
    except ValueError as exc:
        raise BadRequestError("assignee must be one of: ai, human") from exc


def _execution_mode_from_wire(raw: str) -> TaskExecutionMode:
    try:
        return TaskExecutionMode(str(raw).strip().lower())
    except ValueError as exc:
        raise BadRequestError("execution_mode must be one of: autonomous, session") from exc


def _runtime_from_wire(raw: str) -> Runtime:
    try:
        return Runtime(str(raw).strip().lower())
    except ValueError as exc:
        raise BadRequestError("runtime must be one of: openclaw, claude, codex") from exc


def _updated_by_from_wire(raw: str) -> UpdatedBy:
    try:
        return UpdatedBy(str(raw).strip().lower())
    except ValueError as exc:
        raise BadRequestError("updated_by must be one of: human, ai, system") from exc


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


def _is_allowed_upload(mime_type: str, filename: str) -> bool:
    lowered = mime_type.lower()
    ext = Path(filename).suffix.lower()
    if lowered.startswith("image/") or lowered.startswith("video/"):
        return True
    if lowered in {"text/plain", "text/csv"}:
        return True
    return ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".mp4", ".mov", ".m4v", ".webm", ".txt", ".csv"}


def _max_upload_bytes() -> int:
    raw = os.getenv("TM_LOCAL_MAX_UPLOAD_MB", "25").strip()
    try:
        mb = int(raw)
    except ValueError:
        mb = 25
    return max(mb, 1) * 1024 * 1024


def _max_upload_request_bytes() -> int:
    # Base64 expands the raw file size by roughly 4/3. Leave extra room for JSON keys.
    return math.ceil(_max_upload_bytes() * 4 / 3) + 1024 * 1024


def _build_preview_text(content: bytes, kind: str) -> Optional[str]:
    if kind not in {"text", "csv"}:
        return None
    decoded = content.decode("utf-8", errors="replace")
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

        store_path = (
            canonical_store_path(Path(store))
            if store
            else canonical_store_path(suggested_workspace_store(workspace_name))
        )
        LocalJsonProvider(store_path).list_tasks()

        payload = load_workspace_config()
        workspaces = payload.get("workspaces") or {}
        workspaces[workspace_name] = {"store": str(store_path)}
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
        payload = load_workspace_config()
        workspaces = payload.get("workspaces") or {}
        if name not in workspaces:
            raise ValueError(f"Workspace '{name}' not found")
        if len(workspaces) <= 1:
            raise ValueError("Cannot remove the last workspace")
        del workspaces[name]
        payload["workspaces"] = workspaces
        if payload.get("active_workspace") == name:
            payload["active_workspace"] = sorted(workspaces.keys())[0]
        save_workspace_config(payload)
        return self.workspace_payload()


class LocalApiHandler(BaseHTTPRequestHandler):
    runtime: LocalApiRuntime
    uploads_dir: Path
    _response_started: bool

    def _provider(self) -> Provider:
        return self.runtime.provider()

    def _set_headers(
        self,
        status_code: int = 200,
        content_type: str = "application/json",
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self._response_started = True
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        # The shared local API is intentionally unauthenticated and local-first.
        # Wildcard CORS is an explicit developer tradeoff for same-machine UI/tool access.
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

    def _send_empty(self, status_code: int) -> None:
        self._set_headers(status_code, extra_headers={"Content-Length": "0"})

    def _read_json(self, *, max_bytes: int = DEFAULT_MAX_JSON_BODY_BYTES) -> Dict[str, Any]:
        raw_size = self.headers.get("Content-Length", "0")
        try:
            size = int(raw_size)
        except ValueError as exc:
            raise BadRequestError("Content-Length must be a valid integer") from exc
        if size < 0:
            raise BadRequestError("Content-Length must be non-negative")
        if size == 0:
            return {}
        if size > max_bytes:
            raise PayloadTooLargeError(f"Request body exceeds limit of {max_bytes} bytes")
        try:
            data = self.rfile.read(size).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise BadRequestError("Request body must be valid UTF-8 JSON") from exc
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError as exc:
            raise BadRequestError(f"Invalid JSON body: {exc.msg}") from exc
        if not isinstance(parsed, dict):
            raise BadRequestError("JSON body must be an object")
        return parsed

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

    def _resolve_upload_path(self, requested_name: str) -> Path:
        uploads_root = self.uploads_dir.resolve()
        unresolved = self.uploads_dir / requested_name
        try:
            candidate = unresolved.resolve(strict=True)
        except FileNotFoundError as exc:
            candidate = unresolved.resolve(strict=False)
            try:
                candidate.relative_to(uploads_root)
            except ValueError as inner_exc:
                raise BadRequestError("Invalid file path") from inner_exc
            raise BadRequestError("File not found") from exc
        try:
            candidate.relative_to(uploads_root)
        except ValueError as exc:
            raise BadRequestError("Invalid file path") from exc
        if not candidate.is_file():
            raise BadRequestError("File not found")
        return candidate

    def _safe_execute(self, handler: Callable[[], None]) -> None:
        self._response_started = False
        try:
            handler()
        except PayloadTooLargeError as exc:
            if not self._response_started:
                self._send(413, {"ok": False, "error": str(exc)})
        except BadRequestError as exc:
            if not self._response_started:
                self._send(400, {"ok": False, "error": str(exc)})
        except Exception:
            self.log_error("Unhandled local API error:\n%s", traceback.format_exc())
            if not self._response_started:
                self._send(500, {"ok": False, "error": "Internal server error"})

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._safe_execute(self._handle_options)

    def _handle_options(self) -> None:
        self._set_headers(200)

    def do_GET(self) -> None:  # noqa: N802
        self._safe_execute(self._handle_get)

    def _handle_get(self) -> None:
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
            try:
                file_path = self._resolve_upload_path(requested_name)
            except BadRequestError as exc:
                error = str(exc)
                status_code = 404 if error == "File not found" else 400
                self._send(status_code, {"ok": False, "error": error})
                return
            if not file_path.exists():
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
            target_runtime = (query.get("target_runtime") or [None])[0]
            assignee_filter = _assignee_from_wire(assignee) if assignee else None
            status_filter = _status_from_wire(status) if status else None
            execution_mode_filter = _execution_mode_from_wire(execution_mode) if execution_mode else None
            target_runtime_filter = _runtime_from_wire(target_runtime) if target_runtime else None

            tasks = self._provider().list_tasks()
            if assignee_filter:
                tasks = [task for task in tasks if task.assignee == assignee_filter]
            if status_filter:
                tasks = [task for task in tasks if task.status == status_filter]
            if execution_mode_filter:
                tasks = [task for task in tasks if task.execution_mode == execution_mode_filter]
            if target_runtime_filter:
                tasks = [task for task in tasks if task.target_runtime == target_runtime_filter]

            self._send(200, {"ok": True, "tasks": [task.model_dump() for task in tasks]})
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

            if suffix == "notes":
                notes = self._provider().list_notes(task_id)
                self._send(200, {"ok": True, "notes": [note.model_dump() for note in notes]})
                return

            if suffix == "activity":
                activity = self._provider().list_activity(task_id)
                self._send(200, {"ok": True, "activity": [entry.model_dump() for entry in activity]})
                return

            if suffix is None:
                active_run = self._provider().get_active_run(task_id)
                self._send(
                    200,
                    {
                        "ok": True,
                        "task": task.model_dump(),
                        "active_run": active_run.model_dump() if active_run else None,
                        "pending_check_in": (
                            {
                                "requested_at": task.check_in_requested_at,
                                "requested_by": task.check_in_requested_by,
                            }
                            if task.check_in_requested_at
                            else None
                        ),
                    },
                )
                return

            self._send(404, {"ok": False, "error": "Not found"})
            return

        if path.startswith("/context/"):
            task_id = path.split("/")[-1]
            task = self._provider().get_task(task_id)
            if not task:
                self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
                return
            active_run = self._provider().get_active_run(task_id)
            notes = self._provider().list_notes(task_id)
            activity = self._provider().list_activity(task_id)
            envelope = build_context_envelope(task, active_run, notes, activity)
            self._send(200, {"ok": True, "context": envelope})
            return

        self._send(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        self._safe_execute(self._handle_post)

    def _handle_post(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        payload_limit = _max_upload_request_bytes() if path == "/files" else DEFAULT_MAX_JSON_BODY_BYTES
        payload = self._read_json(max_bytes=payload_limit)

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
                self._send(400, {"ok": False, "error": "Unsupported file type. Allowed: images, videos, .txt, .csv"})
                return

            max_bytes = _max_upload_bytes()
            if len(raw_bytes) > max_bytes:
                self._send(413, {"ok": False, "error": f"File exceeds limit of {max_bytes // (1024 * 1024)} MB"})
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
            try:
                task = self._provider().create_task(
                    payload,
                    updated_by=_updated_by_from_wire(str(payload.get("updated_by", "human"))),
                )
            except (ValueError, TypeError) as exc:
                self._send(400, {"ok": False, "error": str(exc)})
                return
            self._send(201, {"ok": True, "task": task.model_dump()})
            return

        if path == "/tasks/claim-next":
            try:
                task, run = self._provider().claim_next_task(
                    runtime=_runtime_from_wire(str(payload.get("runtime", ""))),
                    worker_id=str(payload.get("worker_id", "")).strip(),
                    statuses=[_status_from_wire(item) for item in payload.get("status", ["pending", "in_progress"])],
                    execution_modes=[
                        _execution_mode_from_wire(item)
                        for item in payload.get("execution_mode", ["autonomous"])
                    ],
                    updated_by=_updated_by_from_wire(str(payload.get("updated_by", "ai"))),
                    lease_seconds=int(payload.get("lease_seconds", DEFAULT_LEASE_SECONDS)),
                )
            except (ValueError, TypeError) as exc:
                self._send(400, {"ok": False, "error": str(exc)})
                return

            self._send(
                200,
                {
                    "ok": True,
                    "task": task.model_dump() if task else None,
                    "active_run": run.model_dump() if run else None,
                    "pending_check_in": (
                        {
                            "requested_at": task.check_in_requested_at,
                            "requested_by": task.check_in_requested_by,
                        }
                        if task and task.check_in_requested_at
                        else None
                    ),
                },
            )
            return

        if path.startswith("/tasks/"):
            task_id, suffix = self._route_task_path(path)
            if not task_id:
                self._send(404, {"ok": False, "error": "Not found"})
                return

            if suffix == "notes":
                try:
                    note = self._provider().add_note(
                        task_id,
                        author=_updated_by_from_wire(str(payload.get("author", "human"))),
                        content=str(payload.get("content", "")),
                        kind=str(payload.get("kind", "note")),
                        attachment=payload.get("attachment"),
                    )
                except (ValueError, TypeError) as exc:
                    self._send(400, {"ok": False, "error": str(exc)})
                    return
                self._send(201, {"ok": True, "note": note.model_dump()})
                return

            if suffix == "activity":
                try:
                    entry = self._provider().add_activity(
                        task_id,
                        actor=_updated_by_from_wire(str(payload.get("actor", "ai"))),
                        kind=str(payload.get("kind", "")),
                        summary=str(payload.get("summary", "")),
                        payload=payload.get("payload"),
                        runtime=_runtime_from_wire(str(payload["runtime"])) if payload.get("runtime") else None,
                        worker_id=str(payload.get("worker_id", "")).strip() or None,
                        clear_check_in=bool(payload.get("clear_check_in", False)),
                    )
                except (ValueError, TypeError) as exc:
                    self._send(400, {"ok": False, "error": str(exc)})
                    return
                self._send(201, {"ok": True, "activity": entry.model_dump()})
                return

            if suffix == "respond":
                try:
                    response_payload = payload.get("response")
                    if not isinstance(response_payload, dict):
                        raise BadRequestError("response must be a JSON object")
                    task = self._provider().respond_to_input_request(
                        task_id,
                        updated_by=_updated_by_from_wire(str(payload.get("updated_by", "human"))),
                        response=response_payload,
                    )
                    active_run = self._provider().get_active_run(task_id)
                except (BadRequestError, ValueError, TypeError) as exc:
                    self._send(400, {"ok": False, "error": str(exc)})
                    return
                self._send(
                    200,
                    {
                        "ok": True,
                        "task": task.model_dump(),
                        "active_run": active_run.model_dump() if active_run else None,
                        "pending_check_in": (
                            {
                                "requested_at": task.check_in_requested_at,
                                "requested_by": task.check_in_requested_by,
                            }
                            if task.check_in_requested_at
                            else None
                        ),
                    },
                )
                return

            if suffix == "heartbeat":
                try:
                    run = self._provider().heartbeat(
                        task_id,
                        runtime=_runtime_from_wire(str(payload.get("runtime", ""))),
                        worker_id=str(payload.get("worker_id", "")),
                    )
                    task = self._provider().get_task(task_id)
                except (ValueError, TypeError) as exc:
                    self._send(400, {"ok": False, "error": str(exc)})
                    return
                self._send(
                    200,
                    {
                        "ok": True,
                        "task": task.model_dump() if task else None,
                        "active_run": run.model_dump(),
                        "pending_check_in": (
                            {
                                "requested_at": task.check_in_requested_at,
                                "requested_by": task.check_in_requested_by,
                            }
                            if task and task.check_in_requested_at
                            else None
                        ),
                    },
                )
                return

            if suffix == "check-in-request":
                try:
                    task = self._provider().request_check_in(
                        task_id,
                        requested_by=_updated_by_from_wire(str(payload.get("requested_by", "human"))),
                    )
                    active_run = self._provider().get_active_run(task_id)
                except (ValueError, TypeError) as exc:
                    self._send(400, {"ok": False, "error": str(exc)})
                    return
                self._send(
                    201,
                    {
                        "ok": True,
                        "task": task.model_dump(),
                        "active_run": active_run.model_dump() if active_run else None,
                        "pending_check_in": {
                            "requested_at": task.check_in_requested_at,
                            "requested_by": task.check_in_requested_by,
                        },
                    },
                )
                return

            self._send(404, {"ok": False, "error": "Not found"})
            return

        self._send(404, {"ok": False, "error": "Not found"})

    def do_PATCH(self) -> None:  # noqa: N802
        self._safe_execute(self._handle_patch)

    def _handle_patch(self) -> None:
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

        patch = self._read_json()
        try:
            task = self._provider().update_task(
                task_id,
                patch,
                updated_by=_updated_by_from_wire(str(patch.get("updated_by", "human"))),
                runtime=_runtime_from_wire(str(patch["runtime"])) if patch.get("runtime") else None,
                worker_id=str(patch.get("worker_id", "")).strip() or None,
                allow_override=bool(patch.get("allow_override", False)),
            )
            active_run = self._provider().get_active_run(task_id)
        except (ValueError, TypeError) as exc:
            self._send(400, {"ok": False, "error": str(exc)})
            return

        self._send(
            200,
            {
                "ok": True,
                "task": task.model_dump(),
                "active_run": active_run.model_dump() if active_run else None,
                "pending_check_in": (
                    {
                        "requested_at": task.check_in_requested_at,
                        "requested_by": task.check_in_requested_by,
                    }
                    if task.check_in_requested_at
                    else None
                ),
            },
        )

    def do_DELETE(self) -> None:  # noqa: N802
        self._safe_execute(self._handle_delete)

    def _handle_delete(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/tasks/"):
            task_id, suffix = self._route_task_path(path)
            if not task_id or suffix is not None:
                self._send(404, {"ok": False, "error": "Not found"})
                return

            deleted = self._provider().delete_task(task_id, updated_by=UpdatedBy.HUMAN)
            if not deleted:
                self._send(404, {"ok": False, "error": f"Task '{task_id}' not found"})
                return
            self._send_empty(204)
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
    host: str,
    port: int,
    uploads_dir: Path,
    provider: Optional[Provider] = None,
    provider_factory: Optional[Callable[[], Provider]] = None,
) -> None:
    server = make_server(
        host=host,
        port=port,
        uploads_dir=uploads_dir,
        provider=provider,
        provider_factory=provider_factory,
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
