from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer

from concentray_cli.output import emit
from concentray_cli.paths import canonical_store_path
from concentray_cli.providers.local_json import LocalJsonProvider
from concentray_cli.workspace_store import (
    get_selected_workspace,
    load_workspace_config,
    save_workspace_config,
    suggested_workspace_store,
    workspace_config_path,
)

workspace_app = typer.Typer(help="Workspace commands")


@workspace_app.command("status")
def workspace_status(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = load_workspace_config()
    selected = get_selected_workspace(payload)
    emit(
        {
            "ok": True,
            "config_path": str(workspace_config_path()),
            "active_workspace": payload.get("active_workspace"),
            "selected_workspace": selected,
            "workspaces_count": len(payload.get("workspaces") or {}),
        },
        as_json,
    )


@workspace_app.command("use")
def workspace_use(
    name: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    if name not in workspaces:
        raise typer.BadParameter(f"Workspace '{name}' not found")
    payload["active_workspace"] = name
    save_workspace_config(payload)
    emit(
        {
            "ok": True,
            "active_workspace": name,
            "config_path": str(workspace_config_path()),
        },
        as_json,
    )


@workspace_app.command("add")
def workspace_add(
    name: str = typer.Option(..., "--name"),
    store: Optional[str] = typer.Option(None, "--store"),
    set_active: bool = typer.Option(True, "--set-active/--no-set-active"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    store_path = canonical_store_path(Path(store)) if store else canonical_store_path(suggested_workspace_store(name))
    provider = LocalJsonProvider(store_path)
    provider.list_tasks()

    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    workspaces[name] = {
        "provider": "local_json",
        "store": str(store_path),
    }
    payload["workspaces"] = workspaces
    if set_active or not payload.get("active_workspace"):
        payload["active_workspace"] = name
    save_workspace_config(payload)

    emit(
        {
            "ok": True,
            "workspace": name,
            "provider": "local_json",
            "store": str(store_path),
            "active_workspace": payload.get("active_workspace"),
            "config_path": str(workspace_config_path()),
        },
        as_json,
    )


@workspace_app.command("list")
def workspace_list(as_json: bool = typer.Option(False, "--json")) -> None:
    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    active = payload.get("active_workspace")
    result = []
    for name in sorted(workspaces.keys()):
        record = workspaces.get(name) or {}
        result.append(
            {
                "name": name,
                "provider": record.get("provider"),
                "store": record.get("store"),
                "active": name == active,
            }
        )
    emit({"ok": True, "workspaces": result, "active_workspace": active}, as_json)


@workspace_app.command("remove")
def workspace_remove(
    name: str,
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    payload = load_workspace_config()
    workspaces = payload.get("workspaces") or {}
    if name not in workspaces:
        raise typer.BadParameter(f"Workspace '{name}' not found")
    if len(workspaces) <= 1:
        raise typer.BadParameter("Cannot remove the last workspace")

    del workspaces[name]
    payload["workspaces"] = workspaces
    if payload.get("active_workspace") == name:
        payload["active_workspace"] = sorted(workspaces.keys())[0]
    save_workspace_config(payload)
    emit(
        {
            "ok": True,
            "removed": name,
            "active_workspace": payload.get("active_workspace"),
        },
        as_json,
    )
