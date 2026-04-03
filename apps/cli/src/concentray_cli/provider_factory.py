from __future__ import annotations

import os

from concentray_cli.env import load_environment
from concentray_cli.paths import resolve_local_store_path
from concentray_cli.providers.base import Provider
from concentray_cli.providers.local_json import LocalJsonProvider
from concentray_cli.workspace_store import get_selected_workspace, load_workspace_config


def make_provider() -> Provider:
    load_environment()
    workspace_config = load_workspace_config()
    selected_workspace = get_selected_workspace(workspace_config)

    store = os.getenv("TM_LOCAL_STORE", "").strip()
    if not store and selected_workspace:
        store = str(selected_workspace.get("store", "")).strip()
    return LocalJsonProvider(resolve_local_store_path(store or None))
