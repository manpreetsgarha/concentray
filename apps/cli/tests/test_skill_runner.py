from __future__ import annotations

from pathlib import Path

import pytest

from concentray_cli.skills.runner import load_skill_command


def test_load_skill_command_rejects_missing_or_invalid_entries(tmp_path: Path) -> None:
    allowlist = tmp_path / "skills.yaml"
    allowlist.write_text("skills:\n  echo:\n    command: []\n")

    with pytest.raises(ValueError, match="not allowlisted"):
        load_skill_command(allowlist, "missing")

    with pytest.raises(ValueError, match="command is invalid"):
        load_skill_command(allowlist, "echo")
