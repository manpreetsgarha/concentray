#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI_DIR="$REPO_ROOT/apps/cli"
STORE_FILE="$CLI_DIR/.data/store.json"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3.11 || command -v python3)}"

mkdir -p "$CLI_DIR/.data"
mkdir -p "$REPO_ROOT/.generated"

if [[ ! -f "$STORE_FILE" ]]; then
  cat > "$STORE_FILE" <<'JSON'
{
  "tasks": [],
  "comments": []
}
JSON
fi

cat > "$REPO_ROOT/.generated/tasks_headers.csv" <<'CSV'
Task_ID,Title,Status,Created_By,Assignee,Context_Link,AI_Urgency,Input_Request,Input_Request_Version,Input_Response,Created_At,Updated_At,Updated_By,Version,Field_Clock,Deleted_At
CSV

cat > "$REPO_ROOT/.generated/comments_headers.csv" <<'CSV'
Comment_ID,Task_ID,Author,Timestamp,Message,Type,Attachment_Link,Metadata,Created_At,Updated_At,Version,Deleted_At
CSV

bash "$REPO_ROOT/scripts/bootstrap/bootstrap_openclaw.sh"

echo "\nRunning CLI smoke check (local_json provider)..."
(
  cd "$CLI_DIR"
  export TM_PROVIDER="local_json"
  export TM_LOCAL_STORE="$STORE_FILE"
  export TM_SKILLS_ALLOWLIST="$CLI_DIR/src/concentray_cli/skills/skills.yaml"
  export TM_UPDATED_BY="AI"
  PYTHONPATH="$CLI_DIR/src:${PYTHONPATH:-}" \
    "$PYTHON_BIN" -m concentray_cli.main task get-next --assignee ai --status pending,in_progress --json >/dev/null || true
)

echo "Bootstrap complete."
echo "Generated CSV header templates in: $REPO_ROOT/.generated"
