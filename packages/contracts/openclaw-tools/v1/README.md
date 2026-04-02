# OpenClaw Tool Schemas (v2)

Versioned JSON schemas for plugin wrappers that map to the Python CLI contract.

Concentray v2 is local-first. In normal usage, OpenClaw should point at the same workspace/store as the operator UI, typically `__REPO_ROOT__/.data/store.json`.

## Tool mapping

- `task_get_next` -> `task get-next --runtime openclaw --status ... --execution-mode ... --json`
- `task_claim_next` -> `task claim-next --runtime openclaw --worker-id ... --status ... --execution-mode ... --json`
- `task_get` -> `task get <id> --json`
- `task_update` -> `task update <id> --runtime openclaw --worker-id ... --json`
- `task_heartbeat` -> `task heartbeat <id> --runtime openclaw --worker-id ... --json`
- `activity_add` -> `activity add <task_id> --kind ... --summary ... --runtime openclaw --worker-id ... --json`
- `context_export` -> `context export <task_id> --format json --json`
- `skill_run` -> `skill run <skill_id> --task <task_id> --json`

Repo-local fallback command surface:

- `./scripts/concentray task ... --json`
- `./scripts/concentray activity ... --json`
- `./scripts/concentray context export ... --json`
- `./scripts/concentray skill run ... --json`

OpenClaw should use `task_claim_next` when it intends to start work. `task_get_next` is for read-only queue inspection. Both default to `execution_mode=["autonomous"]`, so session-only tasks stay out of unattended pickup unless the caller overrides that filter. If `worker_id` is omitted, the wrapper derives one from `OPENCLAW_WORKER_ID`, `TM_WORKER_ID`, or the local hostname and uses the required `openclaw:...` worker id format.

Use `activity_add` with structured `payload` when raw tool payloads or autonomous AI chatter should land in the task activity timeline.

Each tool has:

- `<tool>.input.schema.json`
- `<tool>.output.schema.json`

The OpenClaw wrapper at `openclaw/plugin_tools/invoke_tool.py` validates request/response payloads against these schemas.
