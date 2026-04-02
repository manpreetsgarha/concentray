from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional

import typer

from concentray_cli.installers import (
    install_openclaw_plugin_with_cli,
    render_claude_command,
    render_claude_subagent,
)
from concentray_cli.output import emit
from concentray_cli.paths import (
    bundled_skill_path,
    copy_directory,
    openclaw_plugin_id,
    openclaw_plugin_manifest,
    openclaw_plugin_root,
    project_root,
    write_text_file,
)

agent_app = typer.Typer(help="Agent integration commands")


@agent_app.command("install")
def agent_install(
    target: str,
    scope: Optional[str] = typer.Option(None, "--scope"),
    path: Optional[str] = typer.Option(None, "--path"),
    force: bool = typer.Option(False, "--force"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    repo = project_root()
    bundled_skill = bundled_skill_path()
    if not bundled_skill.exists():
        raise typer.BadParameter(f"Bundled skill not found: {bundled_skill}")

    normalized_target = target.strip().lower()
    if normalized_target == "codex":
        install_root = Path(path).expanduser() if path else Path(os.getenv("CODEX_HOME", "~/.codex")).expanduser()
        skill_destination = install_root / "skills" / bundled_skill.name
        copy_directory(bundled_skill, skill_destination, force)
        emit({"ok": True, "target": "codex", "installed": {"skill": str(skill_destination)}}, as_json)
        return

    if normalized_target == "claude":
        normalized_scope = (scope or "project").strip().lower()
        if normalized_scope not in {"project", "user"}:
            raise typer.BadParameter("--scope must be 'project' or 'user'")

        install_root = (
            Path(path).expanduser()
            if path
            else (repo / ".claude" if normalized_scope == "project" else Path("~/.claude").expanduser())
        )
        if normalized_scope == "project" and install_root.resolve() == (repo / ".claude").resolve():
            wrapper_command = "./scripts/concentray"
            store_path = "./.data/store.json"
        else:
            wrapper_command = str(repo / "scripts" / "concentray")
            store_path = str(repo / ".data" / "store.json")

        skill_destination = install_root / "skills" / bundled_skill.name
        copy_directory(bundled_skill, skill_destination, force)

        agent_file = install_root / "agents" / "concentray-operator.md"
        command_file = install_root / "commands" / "concentray-next.md"
        write_text_file(agent_file, render_claude_subagent(wrapper_command, store_path), force)
        write_text_file(command_file, render_claude_command(wrapper_command), force)

        emit(
            {
                "ok": True,
                "target": "claude",
                "scope": normalized_scope,
                "installed": {
                    "skill": str(skill_destination),
                    "agent": str(agent_file),
                    "command": str(command_file),
                },
            },
            as_json,
        )
        return

    if normalized_target == "openclaw":
        script = repo / "scripts" / "bootstrap" / "bootstrap_openclaw.sh"
        process = subprocess.run(
            ["bash", str(script)],
            text=True,
            capture_output=True,
            check=False,
            cwd=str(repo),
        )
        if process.returncode != 0:
            raise typer.BadParameter(process.stderr.strip() or process.stdout.strip() or "OpenClaw install failed")

        plugin_root = openclaw_plugin_root()
        manifest = openclaw_plugin_manifest()
        if not plugin_root.exists() or not manifest.exists():
            raise typer.BadParameter(f"OpenClaw plugin bundle missing: {plugin_root}")

        registration = install_openclaw_plugin_with_cli(repo, plugin_root)
        emit(
            {
                "ok": True,
                "target": "openclaw",
                "plugin_id": openclaw_plugin_id(),
                "plugin_root": str(plugin_root),
                "manifest": str(manifest),
                "profile": str(repo / ".generated" / "openclaw" / "default-agent.toml"),
                "allowlist": str(repo / ".generated" / "openclaw" / "allowlist.toml"),
                "registration": registration,
                "stdout": process.stdout.strip(),
            },
            as_json,
        )
        return

    raise typer.BadParameter("target must be one of: codex, claude, openclaw")
