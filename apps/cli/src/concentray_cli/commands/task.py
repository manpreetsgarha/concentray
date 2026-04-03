from __future__ import annotations

import os
from typing import Any, Optional

import typer

from concentray_cli.output import emit
from concentray_cli.parsing import (
    normalize_worker_id,
    parse_assignee,
    parse_execution_mode,
    parse_execution_modes,
    parse_json_object_option,
    parse_runtime,
    parse_status,
    parse_statuses,
    parse_updated_by,
)
from concentray_cli.provider_factory import make_provider

task_app = typer.Typer(help="Task commands")


def _pending_check_in(task: Any) -> dict[str, Any] | None:
    if not task:
        return None
    requested_at = getattr(task, "check_in_requested_at", None)
    requested_by = getattr(task, "check_in_requested_by", None)
    if not requested_at:
        return None
    return {
        "requested_at": requested_at,
        "requested_by": requested_by,
    }


@task_app.command("create")
def task_create(
    title: str = typer.Option(..., "--title"),
    assignee: str = typer.Option("ai", "--assignee"),
    target_runtime: Optional[str] = typer.Option(None, "--target-runtime"),
    execution_mode: Optional[str] = typer.Option(None, "--execution-mode"),
    ai_urgency: int = typer.Option(3, "--ai-urgency"),
    context_link: Optional[str] = typer.Option(None, "--context-link"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "human"))
    payload: dict[str, Any] = {
        "title": title,
        "assignee": parse_assignee(assignee).value,
        "target_runtime": parse_runtime(target_runtime).value if target_runtime else None,
        "execution_mode": parse_execution_mode(execution_mode).value if execution_mode else None,
        "ai_urgency": ai_urgency,
        "context_link": context_link,
    }
    created = provider.create_task(payload, updated_by=updated_by)
    emit({"ok": True, "task": created.model_dump()}, as_json)


@task_app.command("get-next")
def task_get_next(
    runtime: str = typer.Option(..., "--runtime"),
    status: str = typer.Option("pending,in_progress", "--status"),
    execution_mode: str = typer.Option("autonomous", "--execution-mode"),
    worker_id: Optional[str] = typer.Option(None, "--worker-id"),
    lease_seconds: int = typer.Option(600, "--lease-seconds"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    next_task = provider.get_next_task(
        runtime=parse_runtime(runtime),
        statuses=parse_statuses(status),
        execution_modes=parse_execution_modes(execution_mode),
        worker_id=normalize_worker_id(worker_id),
        lease_seconds=lease_seconds,
    )
    active_run = provider.get_active_run(next_task.id) if next_task else None
    emit(
        {
            "ok": True,
            "task": next_task.model_dump() if next_task else None,
            "active_run": active_run.model_dump() if active_run else None,
            "pending_check_in": _pending_check_in(next_task),
        },
        as_json,
    )


@task_app.command("claim-next")
def task_claim_next(
    runtime: str = typer.Option(..., "--runtime"),
    worker_id: str = typer.Option(..., "--worker-id"),
    status: str = typer.Option("pending,in_progress", "--status"),
    execution_mode: str = typer.Option("autonomous", "--execution-mode"),
    lease_seconds: int = typer.Option(600, "--lease-seconds"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "ai"))
    task, run = provider.claim_next_task(
        runtime=parse_runtime(runtime),
        worker_id=normalize_worker_id(worker_id) or "",
        statuses=parse_statuses(status),
        execution_modes=parse_execution_modes(execution_mode),
        updated_by=updated_by,
        lease_seconds=lease_seconds,
    )
    emit(
        {
            "ok": True,
            "task": task.model_dump() if task else None,
            "active_run": run.model_dump() if run else None,
            "pending_check_in": _pending_check_in(task),
        },
        as_json,
    )


@task_app.command("get")
def task_get(
    task_id: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    active_run = provider.get_active_run(task_id)
    notes = provider.list_notes(task_id)
    activity = provider.list_activity(task_id)

    emit(
        {
            "ok": True,
            "task": task.model_dump(),
            "active_run": active_run.model_dump() if active_run else None,
            "notes": [note.model_dump() for note in notes],
            "activity": [entry.model_dump() for entry in activity],
            "pending_check_in": _pending_check_in(task),
        },
        as_json,
    )


@task_app.command("update")
def task_update(
    task_id: str,
    status: Optional[str] = typer.Option(None, "--status"),
    assignee: Optional[str] = typer.Option(None, "--assignee"),
    target_runtime: Optional[str] = typer.Option(None, "--target-runtime"),
    clear_target_runtime: bool = typer.Option(False, "--clear-target-runtime"),
    execution_mode: Optional[str] = typer.Option(None, "--execution-mode"),
    ai_urgency: Optional[int] = typer.Option(None, "--ai-urgency"),
    context_link: Optional[str] = typer.Option(None, "--context-link"),
    input_request: Optional[str] = typer.Option(None, "--input-request"),
    input_response: Optional[str] = typer.Option(None, "--input-response"),
    clear_check_in: bool = typer.Option(False, "--clear-check-in"),
    runtime: Optional[str] = typer.Option(None, "--runtime"),
    worker_id: Optional[str] = typer.Option(None, "--worker-id"),
    allow_override: bool = typer.Option(False, "--allow-override"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "ai"))
    patch: dict[str, Any] = {"clear_check_in": clear_check_in}

    if status is not None:
        patch["status"] = parse_status(status).value
    if assignee is not None:
        patch["assignee"] = parse_assignee(assignee).value
    if clear_target_runtime:
        patch["target_runtime"] = None
    elif target_runtime is not None:
        patch["target_runtime"] = parse_runtime(target_runtime).value
    if execution_mode is not None:
        patch["execution_mode"] = parse_execution_mode(execution_mode).value
    if ai_urgency is not None:
        patch["ai_urgency"] = ai_urgency
    if context_link is not None:
        patch["context_link"] = context_link
    if input_request is not None:
        patch["input_request"] = parse_json_object_option(input_request, option_name="--input-request")
    if input_response is not None:
        patch["input_response"] = parse_json_object_option(input_response, option_name="--input-response")

    updated = provider.update_task(
        task_id,
        patch,
        updated_by=updated_by,
        runtime=parse_runtime(runtime) if runtime else None,
        worker_id=normalize_worker_id(worker_id),
        allow_override=allow_override,
    )
    active_run = provider.get_active_run(task_id)

    emit(
        {
            "ok": True,
            "task": updated.model_dump(),
            "active_run": active_run.model_dump() if active_run else None,
            "pending_check_in": _pending_check_in(updated),
        },
        as_json,
    )


@task_app.command("heartbeat")
def task_heartbeat(
    task_id: str,
    runtime: str = typer.Option(..., "--runtime"),
    worker_id: str = typer.Option(..., "--worker-id"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    run = provider.heartbeat(
        task_id,
        runtime=parse_runtime(runtime),
        worker_id=normalize_worker_id(worker_id) or "",
    )
    refreshed_task = provider.get_task(task_id)
    emit(
        {
            "ok": True,
            "task": refreshed_task.model_dump() if refreshed_task else None,
            "active_run": run.model_dump(),
            "pending_check_in": _pending_check_in(refreshed_task),
        },
        as_json,
    )


@task_app.command("request-check-in")
def task_request_check_in(
    task_id: str,
    requested_by: str = typer.Option("human", "--requested-by"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.request_check_in(task_id, requested_by=parse_updated_by(requested_by))
    active_run = provider.get_active_run(task_id)
    emit(
        {
            "ok": True,
            "task": task.model_dump(),
            "active_run": active_run.model_dump() if active_run else None,
            "pending_check_in": _pending_check_in(task),
        },
        as_json,
    )


@task_app.command("respond")
def task_respond(
    task_id: str,
    response: str = typer.Option(..., "--response"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    parsed_response = parse_json_object_option(response, option_name="--response")
    if parsed_response is None:
        raise typer.BadParameter("--response must be a JSON object")

    task = provider.respond_to_input_request(
        task_id,
        updated_by=parse_updated_by(os.getenv("TM_UPDATED_BY", "human")),
        response=parsed_response,
    )
    active_run = provider.get_active_run(task_id)
    emit(
        {
            "ok": True,
            "task": task.model_dump(),
            "active_run": active_run.model_dump() if active_run else None,
            "pending_check_in": _pending_check_in(task),
        },
        as_json,
    )


@task_app.command("delete")
def task_delete(
    task_id: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "human"))
    deleted = provider.delete_task(task_id, updated_by=updated_by)
    if not deleted:
        raise typer.BadParameter(f"Task '{task_id}' not found")
    emit({"ok": True, "deleted": True, "task_id": task_id}, as_json)
