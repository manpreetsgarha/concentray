from __future__ import annotations

import json
import os
from typing import Any, Optional

import typer

from concentray_cli.models import Actor, TaskStatus, iso_now
from concentray_cli.output import emit
from concentray_cli.parsing import (
    normalize_worker_id,
    parse_actor,
    parse_execution_mode,
    parse_execution_modes,
    parse_status,
    parse_statuses,
    parse_updated_by,
)
from concentray_cli.provider_factory import make_provider

task_app = typer.Typer(help="Task commands")


@task_app.command("get-next")
def task_get_next(
    assignee: str = typer.Option("ai", "--assignee"),
    status: str = typer.Option("pending,in_progress", "--status"),
    execution_mode: str = typer.Option("session,autonomous", "--execution-mode"),
    worker_id: Optional[str] = typer.Option(None, "--worker-id"),
    lease_seconds: int = typer.Option(1800, "--lease-seconds"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    next_task = provider.get_next_task(
        assignee=assignee,
        statuses=parse_statuses(status),
        execution_modes=parse_execution_modes(execution_mode),
        worker_id=normalize_worker_id(worker_id),
        lease_seconds=lease_seconds,
    )
    emit({"ok": True, "task": next_task.model_dump(by_alias=True) if next_task else None}, as_json)


@task_app.command("claim-next")
def task_claim_next(
    worker_id: str = typer.Option(..., "--worker-id"),
    assignee: str = typer.Option("ai", "--assignee"),
    status: str = typer.Option("pending,in_progress", "--status"),
    execution_mode: str = typer.Option("autonomous", "--execution-mode"),
    lease_seconds: int = typer.Option(1800, "--lease-seconds"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "AI"))
    claimed = provider.claim_next_task(
        worker_id=worker_id,
        assignee=assignee,
        statuses=parse_statuses(status),
        execution_modes=parse_execution_modes(execution_mode),
        updated_by=updated_by,
        lease_seconds=lease_seconds,
    )
    emit({"ok": True, "task": claimed.model_dump(by_alias=True) if claimed else None}, as_json)


@task_app.command("get")
def task_get(
    task_id: str,
    with_comments: bool = typer.Option(False, "--with-comments"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    comments = provider.list_comments(task_id) if with_comments else []

    emit(
        {
            "ok": task is not None,
            "task": task.model_dump(by_alias=True) if task else None,
            "comments": [comment.model_dump(by_alias=True) for comment in comments],
        },
        as_json,
    )


@task_app.command("update")
def task_update(
    task_id: str,
    status: Optional[str] = typer.Option(None, "--status"),
    assignee: Optional[str] = typer.Option(None, "--assignee"),
    execution_mode: Optional[str] = typer.Option(None, "--execution-mode"),
    urgency: Optional[int] = typer.Option(None, "--urgency"),
    input_request: Optional[str] = typer.Option(None, "--input-request"),
    worker_id: Optional[str] = typer.Option(None, "--worker-id"),
    clear_worker: bool = typer.Option(False, "--clear-worker"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    now = iso_now()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "AI"))

    patch_fields: dict[str, Any] = {}
    if status is not None:
        patch_fields["status"] = parse_status(status)

    if assignee is not None:
        patch_fields["assignee"] = parse_actor(assignee)

    if execution_mode is not None:
        patch_fields["execution_mode"] = parse_execution_mode(execution_mode)

    if urgency is not None:
        if urgency < 1 or urgency > 5:
            raise typer.BadParameter("--urgency must be between 1 and 5")
        patch_fields["ai_urgency"] = urgency

    if input_request is not None:
        if input_request.strip() == "null":
            patch_fields["input_request"] = None
            patch_fields["input_request_version"] = None
        else:
            parsed = json.loads(input_request)
            patch_fields["input_request"] = parsed
            patch_fields["input_request_version"] = parsed.get("schema_version", "1.0")

    normalized_worker = normalize_worker_id(worker_id)
    if normalized_worker is not None:
        patch_fields["worker_id"] = normalized_worker
        patch_fields["claimed_at"] = now

    next_status = patch_fields.get("status", task.status)
    next_assignee = patch_fields.get("assignee", task.assignee)
    if clear_worker or next_status != TaskStatus.IN_PROGRESS or next_assignee != Actor.AI:
        patch_fields["worker_id"] = None
        patch_fields["claimed_at"] = None

    for field_name in patch_fields:
        task.field_clock[field_name] = now

    updated = task.model_copy(
        update={
            **patch_fields,
            "updated_at": now,
            "updated_by": updated_by,
            "version": task.version + 1,
            "field_clock": task.field_clock,
        }
    )
    provider.upsert_task(updated)

    emit({"ok": True, "task": updated.model_dump(by_alias=True)}, as_json)


@task_app.command("delete")
def task_delete(
    task_id: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "AI"))
    deleted = provider.delete_task(task_id, updated_by=updated_by)
    if not deleted:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    emit({"ok": True, "task": deleted.model_dump(by_alias=True)}, as_json)
