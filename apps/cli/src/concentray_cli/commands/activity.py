from __future__ import annotations

import os
from typing import Optional

import typer

from concentray_cli.output import emit
from concentray_cli.parsing import normalize_worker_id, parse_json_object_option, parse_runtime, parse_updated_by
from concentray_cli.provider_factory import make_provider

activity_app = typer.Typer(help="Activity commands")


@activity_app.command("add")
def activity_add(
    task_id: str,
    kind: str = typer.Option(..., "--kind"),
    summary: str = typer.Option(..., "--summary"),
    payload: Optional[str] = typer.Option(None, "--payload"),
    runtime: Optional[str] = typer.Option(None, "--runtime"),
    worker_id: Optional[str] = typer.Option(None, "--worker-id"),
    clear_check_in: bool = typer.Option(False, "--clear-check-in"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    entry = provider.add_activity(
        task_id,
        actor=parse_updated_by(os.getenv("TM_UPDATED_BY", "ai")),
        kind=kind,
        summary=summary,
        payload=parse_json_object_option(payload, option_name="--payload"),
        runtime=parse_runtime(runtime) if runtime else None,
        worker_id=normalize_worker_id(worker_id),
        clear_check_in=clear_check_in,
    )
    emit({"ok": True, "activity": entry.model_dump()}, as_json)
