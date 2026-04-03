from __future__ import annotations

import json
from enum import Enum
from typing import Mapping

import typer
import yaml


def _normalize_yaml(value: object) -> object:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(key): _normalize_yaml(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_yaml(item) for item in value]
    if isinstance(value, tuple):
        return [_normalize_yaml(item) for item in value]
    return value


def emit(payload: Mapping[str, object], as_json: bool) -> None:
    if as_json:
        typer.echo(json.dumps(payload, indent=2))
        return

    typer.echo(
        yaml.safe_dump(
            _normalize_yaml(dict(payload)),
            sort_keys=False,
            allow_unicode=False,
            default_flow_style=False,
        ).rstrip()
    )
