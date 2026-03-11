from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List

import yaml


@dataclass
class SkillRunResult:
    exit_code: int
    stdout: str
    stderr: str


def load_skill_command(allowlist_path: Path, skill_id: str) -> List[str]:
    payload = yaml.safe_load(allowlist_path.read_text()) or {}
    skills = payload.get("skills", {})
    if skill_id not in skills:
        raise ValueError(f"Skill '{skill_id}' is not allowlisted")

    command = skills[skill_id].get("command", [])
    if not isinstance(command, list) or not command:
        raise ValueError(f"Skill '{skill_id}' command is invalid")
    return [str(item) for item in command]


def run_skill(
    allowlist_path: Path,
    skill_id: str,
    task_id: str,
    extra_args: List[str],
) -> SkillRunResult:
    command = load_skill_command(allowlist_path, skill_id)
    command += extra_args

    env = os.environ.copy()
    env["TASK_ID"] = task_id

    process = subprocess.run(
        command,
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )

    return SkillRunResult(
        exit_code=process.returncode,
        stdout=process.stdout,
        stderr=process.stderr,
    )
