from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


DEFAULT_HEARTBEAT_SECONDS = 60
DEFAULT_STALE_WARNING_SECONDS = 180
DEFAULT_LEASE_SECONDS = 600
WORKER_ID_PATTERN = re.compile(r"^[a-z0-9._:-]+$")


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
            data["target_runtime"] = None
            data["execution_mode"] = TaskExecutionMode.SESSION.value
        elif "execution_mode" not in data:
            data["execution_mode"] = TaskExecutionMode.AUTONOMOUS.value
        return data

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

    @field_validator("kind", "summary")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("activity fields must not be empty")
        return stripped


class Store(BaseModel):
    tasks: List[Task] = Field(default_factory=list)
    notes: List[Note] = Field(default_factory=list)
    runs: List[Run] = Field(default_factory=list)
    activity: List[Activity] = Field(default_factory=list)


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
