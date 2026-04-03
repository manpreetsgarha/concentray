#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"

if [[ -z "${PYTHON_BIN:-}" ]]; then
  echo "python3 or python is required in PATH." >&2
  exit 1
fi

cd "$REPO_ROOT/apps/cli"

export TM_PROVIDER="${TM_PROVIDER:-local_json}"
tmp_store="$(mktemp)"
trap 'rm -f "$tmp_store"' EXIT
cat > "$tmp_store" <<'JSON'
{
  "schema_version": "1.0",
  "tasks": [
    {
      "id": "smoke-example-1",
      "title": "Smoke example task",
      "status": "pending",
      "assignee": "ai",
      "target_runtime": "openclaw",
      "execution_mode": "autonomous",
      "ai_urgency": 1,
      "context_link": null,
      "input_request": null,
      "input_response": null,
      "active_run_id": null,
      "check_in_requested_at": null,
      "check_in_requested_by": null,
      "created_at": "2026-03-03T10:00:00+00:00",
      "updated_at": "2026-03-03T10:00:00+00:00",
      "updated_by": "human"
    }
  ],
  "notes": [],
  "runs": [],
  "activity": []
}
JSON
export TM_LOCAL_STORE="${TM_LOCAL_STORE:-$tmp_store}"
export TM_SKILLS_ALLOWLIST="${TM_SKILLS_ALLOWLIST:-$REPO_ROOT/apps/cli/src/concentray_cli/skills/skills.yaml}"
export TM_UPDATED_BY="${TM_UPDATED_BY:-ai}"

worker_id="openclaw:autonomous:$(hostname -s | tr '[:upper:]' '[:lower:]'):smoke"
get_next_output="$("$PYTHON_BIN" - <<'PY' "$worker_id" | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" task_claim_next
import json
import sys

print(json.dumps({"worker_id": sys.argv[1]}))
PY
)"
printf '%s\n' "$get_next_output"

task_id="$(printf '%s' "$get_next_output" | "$PYTHON_BIN" -c 'import json,sys; print((json.load(sys.stdin).get("task") or {}).get("id", ""))')"

if [[ -n "$task_id" ]]; then
  "$PYTHON_BIN" - <<'PY' "$task_id" "$worker_id" | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" activity_add
import json
import sys

task_id, worker_id = sys.argv[1:3]
print(json.dumps({
    "task_id": task_id,
    "kind": "tool_call",
    "summary": "Smoke activity from OpenClaw wrapper",
    "payload": {"step": "smoke", "worker_id": worker_id, "stage": "claimed"},
    "worker_id": worker_id,
}))
PY

  "$PYTHON_BIN" - <<'PY' "$task_id" "$worker_id" | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" task_heartbeat
import json
import sys

task_id, worker_id = sys.argv[1:3]
print(json.dumps({"task_id": task_id, "worker_id": worker_id}))
PY

  "$PYTHON_BIN" - <<'PY' "$task_id" "$worker_id" | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" task_update
import json
import sys

task_id, worker_id = sys.argv[1:3]
print(json.dumps({
    "task_id": task_id,
    "status": "blocked",
    "assignee": "human",
    "input_request": {
        "schema_version": "1.0",
        "request_id": "req-smoke",
        "type": "choice",
        "prompt": "Approve the smoke flow?",
        "required": True,
        "created_at": "2026-03-03T10:00:00+00:00",
        "options": ["approve", "reject"],
    },
    "worker_id": worker_id,
}))
PY

  "$PYTHON_BIN" - <<'PY' "$task_id" | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" task_get
import json
import sys

print(json.dumps({"task_id": sys.argv[1]}))
PY

  "$PYTHON_BIN" - <<'PY' "$task_id" | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" context_export
import json
import sys

print(json.dumps({"task_id": sys.argv[1], "format": "json"}))
PY

  "$PYTHON_BIN" - <<'PY' "$task_id" | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" skill_run
import json
import sys

print(json.dumps({"skill_id": "echo_task", "task_id": sys.argv[1]}))
PY
fi
