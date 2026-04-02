from __future__ import annotations

import typer

from concentray_cli.context import build_context_envelope
from concentray_cli.output import emit
from concentray_cli.provider_factory import make_provider

context_app = typer.Typer(help="Context commands")


@context_app.command("export")
def context_export(
    task_id: str,
    format: str = typer.Option("json", "--format"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    if format != "json":
        raise typer.BadParameter("Only json format is supported in v1")

    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    active_run = provider.get_active_run(task_id)
    notes = provider.list_notes(task_id)
    activity = provider.list_activity(task_id)
    envelope = build_context_envelope(task, active_run, notes, activity)
    emit({"ok": True, "context": envelope}, as_json)
