from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import typer
from dotenv import load_dotenv

from concentray_cli.output import emit
from concentray_cli.skills.runner import run_skill

skill_app = typer.Typer(help="Skill commands")


@skill_app.command("run")
def skill_run(
    skill_id: str,
    task: str = typer.Option(..., "--task"),
    args: Optional[str] = typer.Option("", "--args"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    load_dotenv()
    allowlist = os.getenv("TM_SKILLS_ALLOWLIST", "skills/skills.yaml")
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
