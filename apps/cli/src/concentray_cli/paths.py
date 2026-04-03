from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Optional

import typer

from concentray_cli.env import load_environment
from concentray_cli.workspace_store import (
    get_selected_workspace,
    load_workspace_config,
)


def project_root() -> Path:
    override = (os.getenv("CONCENTRAY_ROOT", "") or os.getenv("TM_PROJECT_ROOT", "")).strip()
    if override:
        return Path(override).expanduser().resolve()
    return Path(__file__).resolve().parents[4]


def default_local_store() -> Path:
    return Path(".data/store.json")


def canonical_store_path(path: Path) -> Path:
    expanded = path.expanduser()
    if expanded.is_absolute():
        return expanded
    return (project_root() / expanded).resolve()


def resolve_local_store_path(store_override: Optional[str] = None) -> Path:
    load_environment()
    if store_override:
        return canonical_store_path(Path(store_override))

    env_store = os.getenv("TM_LOCAL_STORE", "").strip()
    if env_store:
        return canonical_store_path(Path(env_store))

    payload = load_workspace_config()
    selected_workspace = get_selected_workspace(payload)
    if selected_workspace:
        selected_store = str(selected_workspace.get("store", "")).strip()
        if selected_store:
            return canonical_store_path(Path(selected_store))

    return canonical_store_path(default_local_store())


def bundled_skill_path() -> Path:
    return project_root() / "skills" / "concentray-task-operator"


def openclaw_plugin_root() -> Path:
    return project_root() / "openclaw" / "plugin"


def openclaw_plugin_manifest() -> Path:
    return openclaw_plugin_root() / "openclaw.plugin.json"


def openclaw_plugin_id() -> str:
    return "concentray"


def copy_directory(source: Path, destination: Path, force: bool) -> None:
    if destination.exists():
        if not force:
            raise typer.BadParameter(f"Destination already exists: {destination}. Use --force to overwrite.")
        if destination.is_dir():
            shutil.rmtree(destination)
        else:
            destination.unlink()
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination)


def write_text_file(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        raise typer.BadParameter(f"Destination already exists: {path}. Use --force to overwrite.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
