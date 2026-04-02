from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from concentray_cli.providers.base import Provider
from concentray_cli.providers.local_json import LocalJsonProvider
from concentray_cli.workspace_store import get_selected_workspace, load_workspace_config


def project_root() -> Path:
    override = (os.getenv("CONCENTRAY_ROOT", "") or os.getenv("TM_PROJECT_ROOT", "")).strip()
    if override:
        return Path(override).expanduser().resolve()
    return Path(__file__).resolve().parents[4]


def resolve_selected_store(raw: str) -> Path:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    return project_root() / path


def make_provider() -> Provider:
    load_dotenv()
    workspace_config = load_workspace_config()
    selected_workspace = get_selected_workspace(workspace_config)

    store = os.getenv("TM_LOCAL_STORE", "").strip()
    if not store and selected_workspace:
        store = str(selected_workspace.get("store", "")).strip()
    if not store:
        store = ".data/store.json"
    if os.getenv("TM_LOCAL_STORE", "").strip():
        return LocalJsonProvider(Path(store).expanduser())
    return LocalJsonProvider(resolve_selected_store(store))
