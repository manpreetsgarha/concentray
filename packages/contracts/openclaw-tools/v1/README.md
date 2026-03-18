# OpenClaw Tool Schemas (v1)

Versioned JSON schemas for plugin wrappers that map to the Python CLI contract.

Concentray v1 is local-first. In normal usage, OpenClaw should point at the same workspace/store as the operator UI, typically `__REPO_ROOT__/.data/store.json`.

## Tool mapping

- `task_get_next` -> `task get-next --assignee ... --status ... --execution-mode ... --json`
- `task_claim_next` -> `task claim-next --worker-id ... --assignee ... --status ... --execution-mode ... --json`
- `task_get` -> `task get <id> --with-comments --json`
- `task_update` -> `task update <id> ... --json`
- `comment_add` -> `comment add <task_id> --message ... --metadata ... --json`
- `context_export` -> `context export <task_id> --format json --json`
- `skill_run` -> `skill run <skill_id> --task <task_id> --json`

Repo-local fallback command surface:

- `./scripts/concentray task ... --json`
- `./scripts/concentray comment ... --json`
- `./scripts/concentray context export ... --json`
- `./scripts/concentray skill run ... --json`

OpenClaw should use `task_claim_next` when it intends to start work. `task_get_next` is for read-only queue inspection. Both default to `execution_mode=["autonomous"]`, so session-only tasks stay out of unattended pickup unless the caller overrides that filter. If `worker_id` is omitted, the wrapper derives one from `OPENCLAW_WORKER_ID`, `TM_WORKER_ID`, or the local hostname.

Use `comment_add` with `type=log` plus structured `metadata` when raw tool payloads or autonomous AI chatter should land in the detailed logs view instead of the operator-facing comment thread.

Each tool has:

- `<tool>.input.schema.json`
- `<tool>.output.schema.json`

The OpenClaw wrapper at `openclaw/plugin_tools/invoke_tool.py` validates request/response payloads against these schemas.
