from __future__ import annotations

import json
from pathlib import Path

from concentray_cli.provider_factory import make_provider


def _write_store(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0",
                "tasks": [],
                "notes": [],
                "runs": [],
                "activity": [],
            }
        )
    )


def test_make_provider_resolves_relative_tm_local_store_from_project_root(tmp_path: Path, monkeypatch) -> None:
    repo_root = tmp_path / "repo"
    cli_src = repo_root / "apps" / "cli" / "src"
    nested = repo_root / "nested"
    cli_src.mkdir(parents=True)
    nested.mkdir(parents=True)

    store_path = repo_root / ".data" / "store.json"
    _write_store(store_path)

    monkeypatch.chdir(nested)
    monkeypatch.setenv("TM_PROJECT_ROOT", str(repo_root))
    monkeypatch.setenv("TM_LOCAL_STORE", ".data/store.json")

    provider = make_provider()

    assert str(provider.store_path) == str(store_path)
