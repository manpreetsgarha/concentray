from __future__ import annotations

import mimetypes
import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator


DEFAULT_HEARTBEAT_SECONDS = 60
DEFAULT_STALE_WARNING_SECONDS = 180
DEFAULT_LEASE_SECONDS = 600
LOCAL_STORE_SCHEMA_VERSION = "1.0"
WORKER_ID_PATTERN = re.compile(r"^[a-z0-9._:-]+$")
ATTACHMENT_KINDS = {"image", "video", "text", "csv", "file"}
INPUT_REQUEST_TYPES = {"choice", "approve_reject", "text_input", "file_or_photo"}
FILE_REQUEST_ACCEPT = {"image/*", "application/pdf", "text/plain"}


class Assignee(str, Enum):
    HUMAN = "human"
    AI = "ai"


class UpdatedBy(str, Enum):
    HUMAN = "human"
    AI = "ai"
    SYSTEM = "system"


class Runtime(str, Enum):
    OPENCLAW = "openclaw"
    CLAUDE = "claude"
    CODEX = "codex"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"


class TaskExecutionMode(str, Enum):
    AUTONOMOUS = "autonomous"
    SESSION = "session"


class NoteKind(str, Enum):
    NOTE = "note"
    ATTACHMENT = "attachment"


class RunStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    ENDED = "ended"


class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    status: TaskStatus = TaskStatus.PENDING
    assignee: Assignee
    target_runtime: Optional[Runtime] = None
    execution_mode: TaskExecutionMode = TaskExecutionMode.AUTONOMOUS
    ai_urgency: int = 3
    context_link: Optional[str] = None
    input_request: Optional[Dict[str, Any]] = None
    input_response: Optional[Dict[str, Any]] = None
    active_run_id: Optional[str] = None
    check_in_requested_at: Optional[str] = None
    check_in_requested_by: Optional[UpdatedBy] = None
    created_at: str = Field(default_factory=lambda: iso_now())
    updated_at: str = Field(default_factory=lambda: iso_now())
    updated_by: UpdatedBy = UpdatedBy.SYSTEM

    model_config = {"use_enum_values": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_runtime_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        assignee = str(data.get("assignee", Assignee.AI.value))
        if assignee == Assignee.HUMAN.value:
            if "target_runtime" not in data:
                data["target_runtime"] = None
            if "execution_mode" not in data or data.get("execution_mode") is None:
                data["execution_mode"] = TaskExecutionMode.SESSION.value
        elif "execution_mode" not in data or data.get("execution_mode") is None:
            data["execution_mode"] = TaskExecutionMode.AUTONOMOUS.value
        return data

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def normalize_required_timestamps(cls, value: Any, info: ValidationInfo) -> str:
        return _normalize_datetime(value, field=info.field_name)

    @field_validator("check_in_requested_at", mode="before")
    @classmethod
    def normalize_optional_timestamps(cls, value: Any, info: ValidationInfo) -> Optional[str]:
        return _normalize_optional_datetime(value, field=info.field_name)

    @field_validator("input_request", mode="before")
    @classmethod
    def normalize_input_request_timestamps(cls, value: Any) -> Any:
        return _canonicalize_input_request_timestamps(value, field="input_request")

    @field_validator("input_response", mode="before")
    @classmethod
    def normalize_input_response_timestamps(cls, value: Any) -> Any:
        return _canonicalize_input_response_timestamps(value, field="input_response")

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title is required")
        return stripped

    @field_validator("ai_urgency")
    @classmethod
    def validate_urgency(cls, value: int) -> int:
        if value < 1 or value > 5:
            raise ValueError("ai_urgency must be between 1 and 5")
        return value


class Note(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    task_id: str
    author: UpdatedBy
    kind: NoteKind = NoteKind.NOTE
    content: str = ""
    attachment: Optional[Dict[str, Any]] = None
    created_at: str = Field(default_factory=lambda: iso_now())

    model_config = {"use_enum_values": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def normalize_created_at(cls, value: Any) -> str:
        return _normalize_datetime(value, field="created_at")

    @field_validator("attachment", mode="before")
    @classmethod
    def normalize_attachment_timestamps(cls, value: Any) -> Any:
        return _canonicalize_attachment_timestamps(value, field="attachment")


class Run(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    task_id: str
    runtime: Runtime
    worker_id: str
    status: RunStatus = RunStatus.ACTIVE
    started_at: str = Field(default_factory=lambda: iso_now())
    last_heartbeat_at: str = Field(default_factory=lambda: iso_now())
    ended_at: Optional[str] = None
    lease_seconds: int = DEFAULT_LEASE_SECONDS
    end_reason: Optional[str] = None

    model_config = {"use_enum_values": True}

    @field_validator("started_at", "last_heartbeat_at", mode="before")
    @classmethod
    def normalize_required_timestamps(cls, value: Any, info: ValidationInfo) -> str:
        return _normalize_datetime(value, field=info.field_name)

    @field_validator("ended_at", mode="before")
    @classmethod
    def normalize_optional_timestamps(cls, value: Any, info: ValidationInfo) -> Optional[str]:
        return _normalize_optional_datetime(value, field=info.field_name)


class Activity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    task_id: str
    run_id: Optional[str] = None
    runtime: Optional[Runtime] = None
    actor: UpdatedBy
    kind: str
    summary: str
    payload: Optional[Dict[str, Any]] = None
    created_at: str = Field(default_factory=lambda: iso_now())

    model_config = {"use_enum_values": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def normalize_created_at(cls, value: Any) -> str:
        return _normalize_datetime(value, field="created_at")

    @field_validator("kind", "summary")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("activity fields must not be empty")
        return stripped


class Store(BaseModel):
    schema_version: str = LOCAL_STORE_SCHEMA_VERSION
    tasks: List[Task] = Field(default_factory=list)
    notes: List[Note] = Field(default_factory=list)
    runs: List[Run] = Field(default_factory=list)
    activity: List[Activity] = Field(default_factory=list)


def _require_object(value: Any, *, field: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be a JSON object")
    return value


def _normalize_string(value: Any, *, field: str, allow_empty: bool = False, default: Optional[str] = None) -> str:
    if value is None:
        if default is not None:
            return default
        raise ValueError(f"{field} is required")
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    normalized = value.strip()
    if not normalized and not allow_empty:
        if default is not None:
            return default
        raise ValueError(f"{field} must not be empty")
    return normalized


def _normalize_bool(value: Any, *, field: str, default: Optional[bool] = None) -> bool:
    if value is None:
        if default is None:
            raise ValueError(f"{field} is required")
        return default
    if not isinstance(value, bool):
        raise ValueError(f"{field} must be a boolean")
    return value


def _normalize_positive_int(value: Any, *, field: str, default: Optional[int] = None) -> int:
    if value is None:
        if default is None:
            raise ValueError(f"{field} is required")
        return default
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{field} must be a positive integer")
    return value


def _normalize_positive_number(value: Any, *, field: str, default: Optional[float] = None) -> float:
    if value is None:
        if default is None:
            raise ValueError(f"{field} is required")
        return default
    if not isinstance(value, (int, float)) or isinstance(value, bool) or float(value) <= 0:
        raise ValueError(f"{field} must be a positive number")
    return float(value)


def _normalize_datetime(value: Any, *, field: str, default: Optional[str] = None) -> str:
    if value is None:
        if default is None:
            raise ValueError(f"{field} is required")
        value = default
    normalized = _normalize_string(value, field=field)
    parsed = parse_iso(normalized)
    if parsed is None:
        raise ValueError(f"{field} must be an ISO timestamp")
    return parsed.isoformat()


def _normalize_optional_datetime(value: Any, *, field: str) -> Optional[str]:
    if value is None:
        return None
    return _normalize_datetime(value, field=field)


def _canonicalize_attachment_timestamps(value: Any, *, field: str) -> Any:
    if not isinstance(value, dict):
        return value
    normalized = dict(value)
    if normalized.get("uploaded_at") is not None:
        normalized["uploaded_at"] = _normalize_datetime(normalized["uploaded_at"], field=f"{field}.uploaded_at")
    return normalized


def _canonicalize_input_request_timestamps(value: Any, *, field: str) -> Any:
    if not isinstance(value, dict):
        return value
    normalized = dict(value)
    if normalized.get("created_at") is not None:
        normalized["created_at"] = _normalize_datetime(normalized["created_at"], field=f"{field}.created_at")
    if normalized.get("expires_at") is not None:
        normalized["expires_at"] = _normalize_datetime(normalized["expires_at"], field=f"{field}.expires_at")
    return normalized


def _canonicalize_input_response_timestamps(value: Any, *, field: str) -> Any:
    if not isinstance(value, dict):
        return value
    normalized = dict(value)
    files = normalized.get("files")
    if normalized.get("type") == "file_or_photo" and isinstance(files, list):
        normalized["files"] = [
            _canonicalize_attachment_timestamps(file_payload, field=f"{field}.files[{index}]")
            for index, file_payload in enumerate(files)
        ]
    return normalized


def _default_input_prompt(input_type: str) -> str:
    if input_type == "choice":
        return "Choose one of the provided options."
    if input_type == "approve_reject":
        return "Approve or reject this request."
    if input_type == "text_input":
        return "Provide the requested information."
    return "Upload the requested file."


def _normalized_attachment_mime_type(payload: Dict[str, Any]) -> Optional[str]:
    mime_type = payload.get("mime_type")
    if isinstance(mime_type, str) and mime_type.strip():
        return mime_type.strip().lower()
    filename = payload.get("filename")
    if isinstance(filename, str) and filename.strip():
        guessed, _ = mimetypes.guess_type(filename.strip())
        return guessed.lower() if guessed else None
    return None


def normalize_attachment_metadata(
    payload: Optional[Dict[str, Any]],
    *,
    field: str = "attachment",
    require_filename: bool = False,
) -> Optional[Dict[str, Any]]:
    if payload is None:
        return None
    data = _require_object(payload, field=field)
    normalized: Dict[str, Any] = {}

    kind = data.get("kind")
    if kind is not None:
        normalized_kind = _normalize_string(kind, field=f"{field}.kind").lower()
        if normalized_kind not in ATTACHMENT_KINDS:
            raise ValueError(f"{field}.kind must be one of: image, video, text, csv, file")
        normalized["kind"] = normalized_kind

    filename = data.get("filename")
    if filename is not None:
        normalized["filename"] = _normalize_string(filename, field=f"{field}.filename")
    elif require_filename:
        raise ValueError(f"{field}.filename is required")

    mime_type = data.get("mime_type")
    if mime_type is not None:
        normalized["mime_type"] = _normalize_string(mime_type, field=f"{field}.mime_type")

    size_bytes = data.get("size_bytes")
    if size_bytes is not None:
        if not isinstance(size_bytes, int) or isinstance(size_bytes, bool) or size_bytes < 0:
            raise ValueError(f"{field}.size_bytes must be a non-negative integer")
        normalized["size_bytes"] = size_bytes

    sha256 = data.get("sha256")
    if sha256 is not None:
        normalized["sha256"] = _normalize_string(sha256, field=f"{field}.sha256")

    uploaded_at = data.get("uploaded_at")
    if uploaded_at is not None:
        normalized["uploaded_at"] = _normalize_datetime(uploaded_at, field=f"{field}.uploaded_at")

    preview_text = data.get("preview_text")
    if preview_text is not None:
        if not isinstance(preview_text, str):
            raise ValueError(f"{field}.preview_text must be a string")
        normalized["preview_text"] = preview_text

    preview_link = data.get("preview_link")
    if preview_link is not None:
        normalized["preview_link"] = _normalize_string(preview_link, field=f"{field}.preview_link")

    download_link = data.get("download_link")
    if download_link is not None:
        normalized["download_link"] = _normalize_string(download_link, field=f"{field}.download_link")

    drive_file_id = data.get("drive_file_id")
    if drive_file_id is not None:
        normalized["drive_file_id"] = _normalize_string(drive_file_id, field=f"{field}.drive_file_id")

    return normalized


def normalize_input_request(payload: Optional[Dict[str, Any]], *, created_at: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if payload is None:
        return None
    data = _require_object(payload, field="input_request")
    input_type = _normalize_string(data.get("type"), field="input_request.type").lower()
    if input_type not in INPUT_REQUEST_TYPES:
        raise ValueError("input_request.type must be one of: choice, approve_reject, text_input, file_or_photo")

    normalized: Dict[str, Any] = {
        "schema_version": "1.0",
        "request_id": _normalize_string(data.get("request_id"), field="input_request.request_id", default=str(uuid4())),
        "type": input_type,
        "prompt": _normalize_string(
            data.get("prompt"),
            field="input_request.prompt",
            default=_default_input_prompt(input_type),
        ),
        "required": _normalize_bool(data.get("required"), field="input_request.required", default=True),
        "created_at": _normalize_datetime(
            data.get("created_at"),
            field="input_request.created_at",
            default=created_at or iso_now(),
        ),
    }

    if data.get("expires_at") is not None:
        normalized["expires_at"] = _normalize_datetime(data.get("expires_at"), field="input_request.expires_at")

    if input_type == "choice":
        options = data.get("options")
        if not isinstance(options, list) or not options:
            raise ValueError("input_request.options must contain at least one choice")
        normalized["options"] = [
            _normalize_string(option, field=f"input_request.options[{index}]")
            for index, option in enumerate(options)
        ]
        normalized["allow_multiple"] = _normalize_bool(
            data.get("allow_multiple"),
            field="input_request.allow_multiple",
            default=False,
        )
        return normalized

    if input_type == "approve_reject":
        normalized["approve_label"] = _normalize_string(
            data.get("approve_label"),
            field="input_request.approve_label",
            default="Approve",
        )
        normalized["reject_label"] = _normalize_string(
            data.get("reject_label"),
            field="input_request.reject_label",
            default="Reject",
        )
        return normalized

    if input_type == "text_input":
        if data.get("placeholder") is not None:
            if not isinstance(data["placeholder"], str):
                raise ValueError("input_request.placeholder must be a string")
            normalized["placeholder"] = data["placeholder"]
        normalized["multiline"] = _normalize_bool(
            data.get("multiline"),
            field="input_request.multiline",
            default=False,
        )
        if data.get("max_length") is not None:
            normalized["max_length"] = _normalize_positive_int(
                data.get("max_length"),
                field="input_request.max_length",
            )
        return normalized

    accept = data.get("accept", ["image/*"])
    if not isinstance(accept, list) or not accept:
        raise ValueError("input_request.accept must contain at least one allowed mime pattern")
    normalized_accept = []
    for index, item in enumerate(accept):
        token = _normalize_string(item, field=f"input_request.accept[{index}]")
        if token not in FILE_REQUEST_ACCEPT:
            raise ValueError("input_request.accept must only contain: image/*, application/pdf, text/plain")
        normalized_accept.append(token)
    normalized["accept"] = normalized_accept
    normalized["max_files"] = _normalize_positive_int(
        data.get("max_files"),
        field="input_request.max_files",
        default=1,
    )
    normalized["max_size_mb"] = _normalize_positive_number(
        data.get("max_size_mb"),
        field="input_request.max_size_mb",
        default=10,
    )
    normalized["capture"] = _normalize_bool(
        data.get("capture"),
        field="input_request.capture",
        default=False,
    )
    return normalized


def _attachment_matches_accept(payload: Dict[str, Any], accept_token: str) -> bool:
    mime_type = _normalized_attachment_mime_type(payload) or ""
    filename = str(payload.get("filename") or "").strip().lower()

    if accept_token == "image/*":
        return mime_type.startswith("image/") or filename.endswith(
            (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")
        )
    if accept_token == "application/pdf":
        return mime_type == "application/pdf" or filename.endswith(".pdf")
    if accept_token == "text/plain":
        return mime_type == "text/plain" or filename.endswith(".txt")
    return False


def normalize_input_response(input_request: Dict[str, Any], payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    request = normalize_input_request(input_request)
    if request is None:
        raise ValueError("Task does not have an active input request")

    data = _require_object(payload, field="input_response")
    response_type = _normalize_string(
        data.get("type"),
        field="input_response.type",
        default=str(request["type"]),
    ).lower()
    if response_type != request["type"]:
        raise ValueError("input_response.type must match the active input request type")

    normalized: Dict[str, Any] = {"type": response_type}

    if response_type == "choice":
        selections = data.get("selections")
        if selections is None and data.get("value") is not None:
            value = data.get("value")
            selections = value if isinstance(value, list) else [value]
        if not isinstance(selections, list) or not selections:
            raise ValueError("input_response.selections must contain at least one selection")
        normalized["selections"] = [
            _normalize_string(choice, field=f"input_response.selections[{index}]")
            for index, choice in enumerate(selections)
        ]
        if len(set(normalized["selections"])) != len(normalized["selections"]):
            raise ValueError("input_response.selections must not contain duplicates")
        allowed = set(request["options"])
        invalid = [choice for choice in normalized["selections"] if choice not in allowed]
        if invalid:
            raise ValueError("input_response.selections must use one of the requested options")
        if not request.get("allow_multiple") and len(normalized["selections"]) != 1:
            raise ValueError("input_response.selections must contain exactly one value for single-choice requests")
        return normalized

    if response_type == "approve_reject":
        normalized["approved"] = _normalize_bool(data.get("approved"), field="input_response.approved")
        return normalized

    if response_type == "text_input":
        value = _normalize_string(data.get("value"), field="input_response.value")
        max_length = request.get("max_length")
        if isinstance(max_length, int) and len(value) > max_length:
            raise ValueError("input_response.value exceeds the request max_length")
        normalized["value"] = value
        return normalized

    files = data.get("files")
    if files is None and data.get("file") is not None:
        files = [data["file"]]
    if not isinstance(files, list) or not files:
        raise ValueError("input_response.files must contain at least one uploaded file")
    if len(files) > int(request["max_files"]):
        raise ValueError("input_response.files exceeds the request max_files limit")

    normalized_files = []
    max_size_bytes = int(float(request["max_size_mb"]) * 1024 * 1024)
    accept_tokens = list(request["accept"])
    for index, item in enumerate(files):
        attachment = normalize_attachment_metadata(
            item,
            field=f"input_response.files[{index}]",
            require_filename=True,
        )
        if attachment is None:
            raise ValueError("input_response.files must contain uploaded file metadata")
        size_bytes = attachment.get("size_bytes")
        if isinstance(size_bytes, int) and size_bytes > max_size_bytes:
            raise ValueError("input_response.files contains a file that exceeds max_size_mb")
        if not any(_attachment_matches_accept(attachment, token) for token in accept_tokens):
            raise ValueError("input_response.files contains a file that does not match the request accept list")
        normalized_files.append(attachment)
    normalized["files"] = normalized_files
    return normalized


def summarize_input_response(payload: Dict[str, Any]) -> str:
    response_type = str(payload.get("type") or "").strip().lower()
    if response_type == "choice":
        selections = payload.get("selections") or []
        return f"Human responded with {len(selections)} choice selection(s)."
    if response_type == "approve_reject":
        return "Human approved the request." if payload.get("approved") else "Human rejected the request."
    if response_type == "text_input":
        return "Human provided the requested text response."
    if response_type == "file_or_photo":
        files = payload.get("files") or []
        return f"Human uploaded {len(files)} requested file(s)."
    return "Human responded to the blocker request."


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def heartbeat_is_stale(last_heartbeat_at: Optional[str], *, now: Optional[datetime] = None, lease_seconds: int) -> bool:
    parsed = parse_iso(last_heartbeat_at)
    if parsed is None:
        return True
    anchor = now or datetime.now(timezone.utc)
    return parsed + timedelta(seconds=lease_seconds) <= anchor


def heartbeat_is_warning(last_heartbeat_at: Optional[str], *, now: Optional[datetime] = None) -> bool:
    parsed = parse_iso(last_heartbeat_at)
    if parsed is None:
        return True
    anchor = now or datetime.now(timezone.utc)
    return parsed + timedelta(seconds=DEFAULT_STALE_WARNING_SECONDS) <= anchor


def validate_worker_id(runtime: Runtime | str, worker_id: str) -> str:
    value = worker_id.strip()
    if not value:
        raise ValueError("worker_id is required")
    if not WORKER_ID_PATTERN.fullmatch(value):
        raise ValueError("worker_id may only contain lowercase letters, numbers, '.', '_', ':', and '-'")
    runtime_value = runtime.value if isinstance(runtime, Runtime) else str(runtime)
    if not value.startswith(f"{runtime_value}:"):
        raise ValueError(f"worker_id must start with '{runtime_value}:'")
    return value
