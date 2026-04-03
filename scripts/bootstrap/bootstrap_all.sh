#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI_DIR="$REPO_ROOT/apps/cli"
STORE_FILE="$REPO_ROOT/.data/store.json"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"

if [[ -z "${PYTHON_BIN:-}" ]]; then
  echo "python3 or python is required in PATH." >&2
  exit 1
fi

mkdir -p "$REPO_ROOT/.data"
mkdir -p "$REPO_ROOT/.generated"

if [[ ! -f "$STORE_FILE" ]]; then
  cat > "$STORE_FILE" <<'JSON'
{
  "schema_version": "1.0",
  "tasks": [],
  "notes": [],
  "runs": [],
  "activity": []
}
JSON
fi

cat > "$REPO_ROOT/.generated/tasks_headers.csv" <<'CSV'
id,title,status,assignee,target_runtime,execution_mode,ai_urgency,context_link,input_request,input_response,active_run_id,check_in_requested_at,check_in_requested_by,created_at,updated_at,updated_by
CSV

cat > "$REPO_ROOT/.generated/notes_headers.csv" <<'CSV'
id,task_id,author,kind,content,attachment,created_at
CSV

cat > "$REPO_ROOT/.generated/runs_headers.csv" <<'CSV'
id,task_id,runtime,worker_id,status,started_at,last_heartbeat_at,ended_at,lease_seconds,end_reason
CSV

cat > "$REPO_ROOT/.generated/activity_headers.csv" <<'CSV'
id,task_id,run_id,runtime,actor,kind,summary,payload,created_at
CSV

bash "$REPO_ROOT/scripts/bootstrap/bootstrap_openclaw.sh"

printf '\nRunning CLI smoke check (local_json provider)...\n'
(
  cd "$CLI_DIR"
  export TM_PROVIDER="local_json"
  export TM_LOCAL_STORE="$STORE_FILE"
  export TM_SKILLS_ALLOWLIST="$CLI_DIR/src/concentray_cli/skills/skills.yaml"
  export TM_UPDATED_BY="AI"
  PYTHONPATH="$CLI_DIR/src:${PYTHONPATH:-}" \
    "$PYTHON_BIN" -m concentray_cli.main task get-next --runtime openclaw --status pending,in_progress --json >/dev/null || true
)

echo "Bootstrap complete."
echo "Generated CSV header templates in: $REPO_ROOT/.generated"
