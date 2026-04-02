from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict

import typer


def install_openclaw_plugin_with_cli(repo: Path, plugin_root: Path) -> Dict[str, Any]:
    openclaw_bin = shutil.which("openclaw")
    if not openclaw_bin:
        return {
            "registered": False,
            "method": None,
            "reason": "openclaw command not found on PATH",
            "restart_required": False,
        }

    install_cmd = [openclaw_bin, "plugins", "install", "-l", str(plugin_root)]
    process = subprocess.run(
        install_cmd,
        text=True,
        capture_output=True,
        check=False,
        cwd=str(repo),
    )

    combined_output = "\n".join(part for part in [process.stdout.strip(), process.stderr.strip()] if part).strip()
    normalized_output = combined_output.lower()
    if process.returncode != 0 and "already" not in normalized_output:
        raise typer.BadParameter(combined_output or "OpenClaw plugin registration failed")

    return {
        "registered": True,
        "method": "openclaw-cli",
        "restart_required": True,
        "command": " ".join(install_cmd),
        "stdout": process.stdout.strip(),
        "stderr": process.stderr.strip(),
    }


def render_claude_subagent(wrapper_command: str, store_path: str) -> str:
    return f"""---
name: concentray-operator
description: Handles queued, resumable, human-in-the-loop work through Concentray. Use when tasks should be read from or updated in Concentray instead of managed ad hoc in chat.
model: sonnet
skills:
  - concentray-task-operator
---
Treat Concentray as the source of truth for task state.

Shared runtime:
- wrapper: `{wrapper_command}`
- store: `{store_path}`
- use a stable worker id for this session, for example `claude-$(hostname -s)`

When no specific task id is provided:
1. Run `{wrapper_command} task claim-next --worker-id claude-$(hostname -s) --assignee ai --status pending,in_progress --json`
2. If no task is available, say so briefly and stop.
3. Otherwise follow the preloaded `concentray-task-operator` skill.
"""


def render_claude_command(wrapper_command: str) -> str:
    return f"""---
description: Pull the next AI task from Concentray and run the operator loop
argument-hint: [optional-focus]
allowed-tools: Read,Glob,Grep,Edit,Write,Bash({wrapper_command}:*)
---
Use the `concentray-task-operator` skill and treat Concentray as the source of truth for task state.

Start by running:

`{wrapper_command} task claim-next --worker-id claude-$(hostname -s) --assignee ai --status pending,in_progress --json`

If no task exists, say so briefly and stop.

If a task exists:
1. Read it with `task get --with-comments`
2. Export structured context with `context export`
3. Perform the work
4. Post progress with `comment add`
5. Update status with `task update`

If `$ARGUMENTS` is provided, treat it as extra focus guidance, not as a replacement for task context.
"""
