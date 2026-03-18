from __future__ import annotations

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


class Actor(str, Enum):
    HUMAN = "Human"
    AI = "AI"


class UpdatedBy(str, Enum):
    HUMAN = "Human"
    AI = "AI"
    SYSTEM = "System"


class TaskStatus(str, Enum):
    PENDING = "Pending"
    IN_PROGRESS = "In Progress"
    BLOCKED = "Blocked"
    DONE = "Done"


class TaskExecutionMode(str, Enum):
    AUTONOMOUS = "Autonomous"
    SESSION = "Session"


class CommentType(str, Enum):
    MESSAGE = "message"
    LOG = "log"
    DECISION = "decision"
    ATTACHMENT = "attachment"


class Task(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid4()), alias="Task_ID")
    title: str = Field(alias="Title")
    status: TaskStatus = Field(alias="Status")
    created_by: Actor = Field(alias="Created_By")
    assignee: Actor = Field(alias="Assignee")
    execution_mode: TaskExecutionMode = Field(default=TaskExecutionMode.AUTONOMOUS, alias="Execution_Mode")
    context_link: Optional[str] = Field(default=None, alias="Context_Link")
    ai_urgency: Optional[int] = Field(default=None, alias="AI_Urgency")
    input_request: Optional[Dict[str, Any]] = Field(default=None, alias="Input_Request")
    input_request_version: Optional[str] = Field(default=None, alias="Input_Request_Version")
    input_response: Optional[Dict[str, Any]] = Field(default=None, alias="Input_Response")
    worker_id: Optional[str] = Field(default=None, alias="Worker_ID")
    claimed_at: Optional[str] = Field(default=None, alias="Claimed_At")
    created_at: str = Field(default_factory=lambda: iso_now(), alias="Created_At")
    updated_at: str = Field(default_factory=lambda: iso_now(), alias="Updated_At")
    updated_by: UpdatedBy = Field(default=UpdatedBy.SYSTEM, alias="Updated_By")
    version: int = Field(default=1, alias="Version")
    field_clock: Dict[str, str] = Field(default_factory=dict, alias="Field_Clock")
    deleted_at: Optional[str] = Field(default=None, alias="Deleted_At")

    model_config = {
        "populate_by_name": True,
        "use_enum_values": True,
    }

    @model_validator(mode="before")
    @classmethod
    def set_default_execution_mode(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "Execution_Mode" in data or "execution_mode" in data:
            return data

        raw_assignee = data.get("Assignee", data.get("assignee"))
        assignee = raw_assignee.value if hasattr(raw_assignee, "value") else str(raw_assignee or "")
        data["Execution_Mode"] = (
            TaskExecutionMode.SESSION.value if assignee.lower() == Actor.HUMAN.value.lower() else TaskExecutionMode.AUTONOMOUS.value
        )
        return data

    @field_validator("ai_urgency")
    @classmethod
    def validate_urgency(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value < 1 or value > 5:
            raise ValueError("AI_Urgency must be between 1 and 5")
        return value


class Comment(BaseModel):
    comment_id: str = Field(default_factory=lambda: str(uuid4()), alias="Comment_ID")
    task_id: str = Field(alias="Task_ID")
    author: Actor = Field(alias="Author")
    timestamp: str = Field(default_factory=lambda: iso_now(), alias="Timestamp")
    message: str = Field(alias="Message")
    type: CommentType = Field(default=CommentType.MESSAGE, alias="Type")
    attachment_link: Optional[str] = Field(default=None, alias="Attachment_Link")
    metadata: Optional[Dict[str, Any]] = Field(default=None, alias="Metadata")
    created_at: str = Field(default_factory=lambda: iso_now(), alias="Created_At")
    updated_at: str = Field(default_factory=lambda: iso_now(), alias="Updated_At")
    version: int = Field(default=1, alias="Version")
    deleted_at: Optional[str] = Field(default=None, alias="Deleted_At")

    model_config = {
        "populate_by_name": True,
        "use_enum_values": True,
    }


class Store(BaseModel):
    tasks: List[Task] = Field(default_factory=list)
    comments: List[Comment] = Field(default_factory=list)


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


def claim_is_stale(claimed_at: Optional[str], *, now: Optional[datetime] = None, lease_seconds: int = 1800) -> bool:
    parsed = parse_iso(claimed_at)
    if parsed is None:
        return True
    anchor = now or datetime.now(timezone.utc)
    return parsed + timedelta(seconds=lease_seconds) <= anchor
