# Concentray Skill for OpenClaw

Use this skill when handling collaborative Concentray workflows.

## Primary rule
Use plugin tools first (`task_claim_next`, `task_get_next`, `task_get`, `task_heartbeat`, `activity_add`, `task_update`, `context_export`, `skill_run`).
These tools are provided by the native Concentray OpenClaw plugin under `openclaw/plugin/` once `./scripts/concentray agent install openclaw` has been run.
Only fall back to direct shell CLI commands if plugin tools are unavailable.

## Runtime assumptions
1. Concentray v2 is local-first.
2. The agent must point at the same workspace/store as the operator UI.
3. Default shared store path is `__REPO_ROOT__/.data/store.json`.
4. If a different workspace is active, prefer `TM_WORKSPACE=<name>` or `TM_LOCAL_STORE=<absolute path>` over guessing.

## Canonical command contracts
- `task claim-next --runtime openclaw --worker-id <worker_id> --status pending,in_progress --execution-mode autonomous --json`
- `task get-next --runtime openclaw --status pending,in_progress --execution-mode autonomous --json`
- `task get <task_id> --json`
- `task heartbeat <task_id> --runtime openclaw --worker-id <worker_id> --json`
- `task update <task_id> --runtime openclaw --worker-id <worker_id> --status ... --assignee ... --target-runtime ... --input-request ... --json`
- `activity add <task_id> --kind ... --summary ... --payload ... --runtime openclaw --worker-id <worker_id> --json`
- `context export <task_id> --format json --json`
- `skill run <skill_id> --task <task_id> --json`

## Behavioral guidance
1. Use `task_claim_next` when starting work so another agent does not pick the same task.
2. Use `task_get_next` only for queue inspection or read-only previews.
3. Always read task context before changing status.
4. Post verbose execution traces through `activity_add`. Put raw tool payloads in `payload`.
5. Refresh the lease periodically with `task_heartbeat` during long-running work.
6. If blocked, write `status=blocked` and an `input_request` payload.
6. Keep unattended OpenClaw pickup on `execution_mode=autonomous`. Use `session` only for tasks that should wait for a live Claude/Codex session.
7. Keep outputs structured JSON for reliable downstream parsing.

## Fallback shell usage
If plugin tools are unavailable, run the repo-local wrapper from the project root:

- `./scripts/concentray task claim-next --runtime openclaw --worker-id openclaw:autonomous:$(hostname -s):main --status pending,in_progress --execution-mode autonomous --json`
- `./scripts/concentray task get-next --runtime openclaw --status pending,in_progress --execution-mode autonomous --json`
- `./scripts/concentray task get <task_id> --json`
- `./scripts/concentray task heartbeat <task_id> --runtime openclaw --worker-id openclaw:autonomous:$(hostname -s):main --json`
- `./scripts/concentray task update <task_id> --runtime openclaw --worker-id openclaw:autonomous:$(hostname -s):main --status ... --assignee ... --target-runtime ... --input-request ... --json`
- `./scripts/concentray activity add <task_id> --kind ... --summary ... --payload ... --runtime openclaw --worker-id openclaw:autonomous:$(hostname -s):main --json`
- `./scripts/concentray context export <task_id> --format json --json`
- `./scripts/concentray skill run <skill_id> --task <task_id> --json`
