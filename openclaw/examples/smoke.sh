#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3.11 || command -v python3)}"
cd "$REPO_ROOT/apps/cli"

export TM_PROVIDER="${TM_PROVIDER:-local_json}"
tmp_store="$(mktemp)"
cat > "$tmp_store" <<'JSON'
{
  "tasks": [
    {
      "Task_ID": "smoke-example-1",
      "Title": "Smoke example task",
      "Status": "Pending",
      "Created_By": "Human",
      "Assignee": "AI",
      "Context_Link": null,
      "AI_Urgency": 1,
      "Input_Request": null,
      "Input_Request_Version": null,
      "Input_Response": null,
      "Created_At": "2026-03-03T10:00:00+00:00",
      "Updated_At": "2026-03-03T10:00:00+00:00",
      "Updated_By": "Human",
      "Version": 1,
      "Field_Clock": {},
      "Deleted_At": null
    }
  ],
  "comments": []
}
JSON
export TM_LOCAL_STORE="${TM_LOCAL_STORE:-$tmp_store}"
export TM_SKILLS_ALLOWLIST="${TM_SKILLS_ALLOWLIST:-$REPO_ROOT/apps/cli/src/concentray_cli/skills/skills.yaml}"
export TM_UPDATED_BY="${TM_UPDATED_BY:-AI}"

get_next_output="$(printf '{"worker_id":"openclaw-smoke","assignee":"ai","status":["pending","in_progress"]}' | bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" task_claim_next)"
printf '%s\n' "$get_next_output"

task_id="$(printf '%s' "$get_next_output" | "$PYTHON_BIN" -c 'import json,sys; print((json.load(sys.stdin).get("task") or {}).get("Task_ID", ""))')"

if [[ -n "$task_id" ]]; then
  printf '{"task_id":"%s","message":"Smoke log from OpenClaw wrapper","type":"log","metadata":{"step":"smoke","payload":{"worker_id":"openclaw-smoke","stage":"claimed"}}}' "$task_id" | \
    bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" comment_add

  printf '{"task_id":"%s","status":"blocked","assignee":"human","urgency":5,"input_request":{"schema_version":"1.0","type":"choice","options":["approve","reject"]}}' "$task_id" | \
    bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" task_update

  printf '{"task_id":"%s","with_comments":true}' "$task_id" | \
    bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" task_get

  printf '{"task_id":"%s","format":"json"}' "$task_id" | \
    bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" context_export

  printf '{"skill_id":"echo_task","task_id":"%s"}' "$task_id" | \
    bash "$REPO_ROOT/openclaw/plugin_tools/run_tool.sh" skill_run
fi

rm -f "$tmp_store"
