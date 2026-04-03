from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values, find_dotenv

_loaded_env_path: Path | None = None
_loaded_env_values: dict[str, str] = {}


def load_environment() -> None:
    global _loaded_env_path, _loaded_env_values

    found = find_dotenv(usecwd=True)
    env_path = Path(found).resolve() if found else None
    env_values = (
        {
            key: value
            for key, value in dotenv_values(env_path).items()
            if isinstance(value, str)
        }
        if env_path
        else {}
    )

    if env_path == _loaded_env_path and env_values == _loaded_env_values:
        return

    for key, previous in _loaded_env_values.items():
        if os.environ.get(key) == previous:
            os.environ.pop(key, None)

    for key, value in env_values.items():
        os.environ.setdefault(key, value)

    _loaded_env_path = env_path
    _loaded_env_values = env_values
