from __future__ import annotations

import json
from typing import Dict

import typer


def emit(payload: Dict[str, object], as_json: bool) -> None:
    if as_json:
        typer.echo(json.dumps(payload, indent=2))
    else:
        typer.echo(payload)
