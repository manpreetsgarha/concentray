from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional


def _empty_workspace_config() -> Dict[str, Any]:
    return {"workspaces": {}, "active_workspace": None}


def default_workspace_name() -> str:
    return "default"


def slugify_workspace_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "workspace"


def suggested_workspace_store(name: str) -> Path:
    if name.strip().lower() == default_workspace_name():
        return Path(".data/store.json")
    return Path(".data/workspaces") / f"{slugify_workspace_name(name)}.json"


def workspace_config_path() -> Path:
    raw = os.getenv("TM_WORKSPACE_CONFIG", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path("~/.config/concentray/workspaces.json").expanduser()


def _normalize_workspace_config(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return _empty_workspace_config()

    workspaces = payload.get("workspaces") or {}
    active_workspace = payload.get("active_workspace")

    if not isinstance(workspaces, dict):
        return _empty_workspace_config()

    normalized_workspaces: Dict[str, Dict[str, Any]] = {}
    for name, record in workspaces.items():
        if isinstance(record, dict):
            normalized_workspaces[str(name)] = record

    if not normalized_workspaces:
        return _empty_workspace_config()

    normalized_active = str(active_workspace) if active_workspace is not None else None
    if normalized_active not in normalized_workspaces:
        normalized_active = next(iter(normalized_workspaces)) if len(normalized_workspaces) == 1 else None

    return {
        "workspaces": normalized_workspaces,
        "active_workspace": normalized_active,
    }


def load_workspace_config() -> Dict[str, Any]:
    path = workspace_config_path()
    if not path.exists():
        return _empty_workspace_config()

    try:
        payload = json.loads(path.read_text())
    except Exception:
        return _empty_workspace_config()

    return _normalize_workspace_config(payload)


def save_workspace_config(payload: Dict[str, Any]) -> None:
    path = workspace_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        prefix=f"{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        text=True,
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(_normalize_workspace_config(payload), indent=2, sort_keys=True))
        temp_path.replace(path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def get_selected_workspace(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    workspace_name = os.getenv("TM_WORKSPACE", "").strip() or str(payload.get("active_workspace") or "").strip()
    workspaces = payload.get("workspaces") or {}
    if not workspace_name:
        if len(workspaces) == 1:
            workspace_name = next(iter(workspaces))
        else:
            return None

    workspace = workspaces.get(workspace_name)
    if not isinstance(workspace, dict):
        return None
    return {"name": workspace_name, **workspace}
