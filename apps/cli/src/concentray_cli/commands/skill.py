from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import typer

from concentray_cli.env import load_environment
from concentray_cli.output import emit
from concentray_cli.skills.runner import run_skill

skill_app = typer.Typer(help="Skill commands")


@skill_app.command("run")
def skill_run(
    skill_id: str,
    task: str = typer.Option(..., "--task"),
    args: Optional[str] = typer.Option("", "--args"),
    args_json: Optional[str] = typer.Option(None, "--args-json"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    load_environment()
    allowlist = os.getenv("TM_SKILLS_ALLOWLIST", "skills/skills.yaml")
    if args_json is not None:
        try:
            parsed_args = json.loads(args_json)
        except json.JSONDecodeError as exc:
            raise typer.BadParameter(f"Invalid --args-json JSON: {exc.msg}") from exc
        if not isinstance(parsed_args, list) or not all(isinstance(item, str) for item in parsed_args):
            raise typer.BadParameter("--args-json must be a JSON array of strings")
        extra_args = parsed_args
    else:
        extra_args = [item for item in args.split(",") if item.strip()]

    result = run_skill(
        allowlist_path=Path(allowlist),
        skill_id=skill_id,
        task_id=task,
        extra_args=extra_args,
    )

    emit(
        {
            "ok": result.exit_code == 0,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
        },
        as_json,
    )
