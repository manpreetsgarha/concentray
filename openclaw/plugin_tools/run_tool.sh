#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3.11 || command -v python3)}"

exec "$PYTHON_BIN" "$REPO_ROOT/openclaw/plugin_tools/invoke_tool.py" "$@"
