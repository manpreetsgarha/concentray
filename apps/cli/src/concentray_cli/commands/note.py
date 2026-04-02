from __future__ import annotations

import os
from typing import Optional

import typer

from concentray_cli.output import emit
from concentray_cli.parsing import parse_json_object_option, parse_updated_by
from concentray_cli.provider_factory import make_provider

note_app = typer.Typer(help="Note commands")


@note_app.command("add")
def note_add(
    task_id: str,
    content: str = typer.Option("", "--content"),
    kind: str = typer.Option("note", "--kind"),
    attachment: Optional[str] = typer.Option(None, "--attachment"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    note = provider.add_note(
        task_id,
        author=parse_updated_by(os.getenv("TM_UPDATED_BY", "human")),
        content=content,
        kind=kind,
        attachment=parse_json_object_option(attachment, option_name="--attachment"),
    )
    emit({"ok": True, "note": note.model_dump()}, as_json)
