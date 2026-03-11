# Concentray Skill for OpenClaw

Use this skill when handling collaborative Concentray workflows.

## Primary rule
Use plugin tools first (`task_claim_next`, `task_get_next`, `task_get`, `task_update`, `comment_add`, `context_export`, `skill_run`).
These tools are provided by the native Concentray OpenClaw plugin under `openclaw/plugin/` once `./scripts/concentray agent install openclaw` has been run.
Only fall back to direct shell CLI commands if plugin tools are unavailable.

## Runtime assumptions
1. Concentray v1 is local-first.
2. The agent must point at the same workspace/store as the operator UI.
3. Default shared store path is `__REPO_ROOT__/.data/store.json`.
4. If a different workspace is active, prefer `TM_WORKSPACE=<name>` or `TM_LOCAL_STORE=<absolute path>` over guessing.

## Canonical command contracts
- `task claim-next --worker-id <worker_id> --assignee ai --status pending,in_progress --json`
- `task get-next --assignee ai --status pending,in_progress --json`
- `task get <task_id> --with-comments --json`
- `task update <task_id> --status ... --assignee ... --urgency ... --input-request ... --json`
- `comment add <task_id> --message ... --type ... --attachment ... --metadata ... --json`
- `context export <task_id> --format json --json`
- `skill run <skill_id> --task <task_id> --json`

## Behavioral guidance
1. Use `task_claim_next` when starting work so another agent does not pick the same task.
2. Use `task_get_next` only for queue inspection or read-only previews.
3. Always read task context before changing status.
4. There is no separate log tool. Post verbose execution traces through `comment_add` with `type="log"`. Put raw tool payloads in `metadata` so the operator can keep the main comment thread clean.
5. If blocked, write `Status=Blocked` and an `Input_Request` payload.
6. Prefer `Assignee=AI` only when AI can act immediately.
7. Keep outputs structured JSON for reliable downstream parsing.

## Fallback shell usage
If plugin tools are unavailable, run the repo-local wrapper from the project root:

- `./scripts/concentray task claim-next --worker-id openclaw-$(hostname -s) --assignee ai --status pending,in_progress --json`
- `./scripts/concentray task get-next --assignee ai --status pending,in_progress --json`
- `./scripts/concentray task get <task_id> --with-comments --json`
- `./scripts/concentray task update <task_id> --status ... --assignee ... --urgency ... --input-request ... --json`
- `./scripts/concentray comment add <task_id> --message ... --type ... --attachment ... --metadata ... --json`
- `./scripts/concentray context export <task_id> --format json --json`
- `./scripts/concentray skill run <skill_id> --task <task_id> --json`
