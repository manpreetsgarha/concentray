from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import typer

from concentray_cli.models import Actor, CommentType, TaskExecutionMode, TaskStatus, UpdatedBy


STATUS_MAP = {
    "pending": TaskStatus.PENDING,
    "in_progress": TaskStatus.IN_PROGRESS,
    "blocked": TaskStatus.BLOCKED,
    "done": TaskStatus.DONE,
}

EXECUTION_MODE_MAP = {
    "autonomous": TaskExecutionMode.AUTONOMOUS,
    "session": TaskExecutionMode.SESSION,
}

ACTOR_MAP = {
    "ai": Actor.AI,
    "human": Actor.HUMAN,
}

UPDATED_BY_MAP = {
    "ai": UpdatedBy.AI,
    "human": UpdatedBy.HUMAN,
    "system": UpdatedBy.SYSTEM,
}

COMMENT_TYPE_MAP = {
    "message": CommentType.MESSAGE,
    "log": CommentType.LOG,
    "decision": CommentType.DECISION,
    "attachment": CommentType.ATTACHMENT,
}


def parse_statuses(raw: str) -> List[TaskStatus]:
    result: List[TaskStatus] = []
    for item in raw.split(","):
        key = item.strip().lower()
        if key not in STATUS_MAP:
            raise typer.BadParameter(f"Unsupported status '{item}'")
        result.append(STATUS_MAP[key])
    return result


def parse_status(raw: str) -> TaskStatus:
    key = raw.strip().lower()
    if key not in STATUS_MAP:
        raise typer.BadParameter("Invalid --status")
    return STATUS_MAP[key]


def parse_execution_modes(raw: str) -> List[TaskExecutionMode]:
    result: List[TaskExecutionMode] = []
    for item in raw.split(","):
        key = item.strip().lower()
        if key not in EXECUTION_MODE_MAP:
            raise typer.BadParameter(f"Unsupported execution mode '{item}'")
        result.append(EXECUTION_MODE_MAP[key])
    return result


def parse_execution_mode(raw: str) -> TaskExecutionMode:
    modes = parse_execution_modes(raw)
    if len(modes) != 1:
        raise typer.BadParameter("Execution mode must be one of: autonomous, session")
    return modes[0]


def parse_actor(raw: str) -> Actor:
    key = raw.strip().lower()
    if key not in ACTOR_MAP:
        raise typer.BadParameter("Actor must be 'ai' or 'human'")
    return ACTOR_MAP[key]


def parse_updated_by(raw: str) -> UpdatedBy:
    key = raw.strip().lower()
    if key not in UPDATED_BY_MAP:
        raise typer.BadParameter("TM_UPDATED_BY must be one of: AI, Human, System")
    return UPDATED_BY_MAP[key]


def parse_comment_type(raw: str) -> CommentType:
    key = raw.strip().lower()
    if key not in COMMENT_TYPE_MAP:
        raise typer.BadParameter("Invalid comment --type")
    return COMMENT_TYPE_MAP[key]


def normalize_worker_id(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    value = raw.strip()
    return value or None


def parse_json_object_option(raw: Optional[str], *, option_name: str) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    value = raw.strip()
    if not value or value.lower() == "null":
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise typer.BadParameter(f"Invalid {option_name} JSON: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise typer.BadParameter(f"{option_name} must be a JSON object or null")
    return parsed
