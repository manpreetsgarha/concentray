#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"

if [[ -z "${PYTHON_BIN:-}" ]]; then
  echo "python3 or python is required in PATH." >&2
  exit 1
fi

exec "$PYTHON_BIN" "$REPO_ROOT/openclaw/plugin_tools/invoke_tool.py" "$@"
