from __future__ import annotations

import typer

from concentray_cli.commands.activity import activity_app
from concentray_cli.commands.agent import agent_app
from concentray_cli.commands.context import context_app
from concentray_cli.commands.note import note_app
from concentray_cli.commands.runtime import (
    doctor,
    init_workspace,
    runtime_app,
    runtime_status,
    serve_local_api,
    start_workspace,
    stop_runtime,
)
from concentray_cli.commands.skill import skill_app
from concentray_cli.commands.task import task_app
from concentray_cli.commands.workspace import workspace_app

app = typer.Typer(help="Concentray CLI")

app.add_typer(task_app, name="task")
app.add_typer(note_app, name="note")
app.add_typer(activity_app, name="activity")
app.add_typer(context_app, name="context")
app.add_typer(skill_app, name="skill", hidden=True)
app.add_typer(workspace_app, name="workspace", hidden=True)
app.add_typer(agent_app, name="agent", hidden=True)
app.add_typer(runtime_app, name="runtime", hidden=True)

app.command("init")(init_workspace)
app.command("doctor")(doctor)
app.command("start")(start_workspace)
app.command("serve-local-api")(serve_local_api)
app.command("status")(runtime_status)
app.command("stop")(stop_runtime)


def main() -> None:
    app()


__all__ = ["app", "main"]


if __name__ == "__main__":
    main()
