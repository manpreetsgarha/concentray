from __future__ import annotations

import os
from typing import Optional

import typer

from concentray_cli.models import Actor, Comment, UpdatedBy
from concentray_cli.output import emit
from concentray_cli.parsing import parse_comment_type, parse_json_object_option, parse_updated_by
from concentray_cli.provider_factory import make_provider

comment_app = typer.Typer(help="Comment commands")


@comment_app.command("add")
def comment_add(
    task_id: str,
    message: str = typer.Option(..., "--message"),
    type: str = typer.Option("message", "--type"),
    attachment: Optional[str] = typer.Option(None, "--attachment"),
    metadata: Optional[str] = typer.Option(None, "--metadata"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    provider = make_provider()
    task = provider.get_task(task_id)
    if not task:
        raise typer.BadParameter(f"Task '{task_id}' not found")

    updated_by = parse_updated_by(os.getenv("TM_UPDATED_BY", "AI"))
    author = Actor.AI if updated_by == UpdatedBy.SYSTEM else Actor(updated_by.value)
    parsed_metadata = parse_json_object_option(metadata, option_name="--metadata")

    comment = Comment(
        Task_ID=task_id,
        Author=author,
        Message=message,
        Type=parse_comment_type(type),
        Attachment_Link=attachment,
        Metadata=parsed_metadata,
    )

    provider.add_comment(comment)
    emit({"ok": True, "comment": comment.model_dump(by_alias=True)}, as_json)
