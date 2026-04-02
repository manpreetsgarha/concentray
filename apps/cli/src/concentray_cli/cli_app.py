from __future__ import annotations

import typer

from concentray_cli.commands.activity import activity_app
from concentray_cli.commands.agent import agent_app
from concentray_cli.commands.context import context_app
from concentray_cli.commands.note import note_app
from concentray_cli.commands.runtime import runtime_app
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

for command in runtime_app.registered_commands:
    app.registered_commands.append(command)


def main() -> None:
    app()


__all__ = ["app", "main"]


if __name__ == "__main__":
    main()
