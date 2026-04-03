from __future__ import annotations

import json

from concentray_cli.workspace_store import get_selected_workspace, load_workspace_config, save_workspace_config


def test_workspace_config_ignores_invalid_records(tmp_path, monkeypatch) -> None:
    config_path = tmp_path / "workspaces.json"
    config_path.write_text(json.dumps({"workspaces": {"default": "bad", "good": {"store": ".data/store.json"}}, "active_workspace": "default"}))
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(config_path))

    payload = load_workspace_config()

    assert payload["workspaces"] == {"good": {"store": ".data/store.json"}}
    assert payload["active_workspace"] == "good"
    assert get_selected_workspace(payload) == {"name": "good", "store": ".data/store.json"}


def test_save_workspace_config_normalizes_payload(tmp_path, monkeypatch) -> None:
    config_path = tmp_path / "workspaces.json"
    monkeypatch.setenv("TM_WORKSPACE_CONFIG", str(config_path))

    save_workspace_config({"workspaces": {"default": {"store": ".data/store.json"}}, "active_workspace": "missing"})
    payload = load_workspace_config()

    assert payload["active_workspace"] == "default"
