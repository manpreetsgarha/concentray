from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

import typer

from concentray_cli.models import Assignee, Runtime, TaskExecutionMode, TaskStatus, UpdatedBy


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

ASSIGNEE_MAP = {
    "ai": Assignee.AI,
    "human": Assignee.HUMAN,
}

RUNTIME_MAP = {
    "openclaw": Runtime.OPENCLAW,
    "claude": Runtime.CLAUDE,
    "codex": Runtime.CODEX,
}

UPDATED_BY_MAP = {
    "ai": UpdatedBy.AI,
    "human": UpdatedBy.HUMAN,
    "system": UpdatedBy.SYSTEM,
}

WORKER_ID_PATTERN = re.compile(r"^[a-z0-9._:-]+$")


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


def parse_assignee(raw: str) -> Assignee:
    key = raw.strip().lower()
    if key not in ASSIGNEE_MAP:
        raise typer.BadParameter("assignee must be 'ai' or 'human'")
    return ASSIGNEE_MAP[key]


def parse_runtime(raw: str) -> Runtime:
    key = raw.strip().lower()
    if key not in RUNTIME_MAP:
        raise typer.BadParameter("runtime must be one of: openclaw, claude, codex")
    return RUNTIME_MAP[key]


def parse_updated_by(raw: str) -> UpdatedBy:
    key = raw.strip().lower()
    if key not in UPDATED_BY_MAP:
        raise typer.BadParameter("updated_by must be one of: ai, human, system")
    return UPDATED_BY_MAP[key]


def normalize_worker_id(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    if not WORKER_ID_PATTERN.fullmatch(value):
        raise typer.BadParameter("worker_id may only contain lowercase letters, numbers, '.', '_', ':', and '-'")
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
