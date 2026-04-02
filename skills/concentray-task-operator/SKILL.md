---
name: concentray-task-operator
description: Use this when an agent should treat Concentray as the source of truth for queued work, task context, blocker updates, and progress logs. Trigger for ongoing human-and-agent workflows, multi-step execution, resumable task loops, or when working from the local Concentray CLI instead of ad hoc chat state.
---

# Concentray Task Operator

Use this skill when work should move through Concentray rather than living only in the chat.

This is useful for:
- queued tasks instead of one-off requests
- resumable work across sessions
- human unblock / approval loops
- cases where the operator will monitor progress in the web or phone UI

Do not use this skill for trivial one-shot tasks that can be completed directly in the current chat without persistent task state.

## Runtime assumptions

1. Concentray v2 is local-first.
2. The repo-local wrapper is the canonical entrypoint: `./scripts/concentray`.
3. The default shared store is `./.data/store.json`.
4. The UI and agent are most useful when they point at the same workspace/store.

## Operating loop

1. Claim the next task with a stable worker id:
   - Live Claude/Codex session: `./scripts/concentray task claim-next --runtime codex --worker-id codex:session:$(hostname -s):main --status pending,in_progress --execution-mode session,autonomous --json`
   - Unattended loop: `./scripts/concentray task claim-next --runtime codex --worker-id codex:autonomous:$(hostname -s):main --status pending,in_progress --execution-mode autonomous --json`
2. Read the task context:
   - `./scripts/concentray task get <task_id> --json`
3. Export structured context:
   - `./scripts/concentray context export <task_id> --format json --json`
4. Perform the work in the repo or local environment.
5. Post meaningful progress:
   - `./scripts/concentray activity add <task_id> --kind tool_call --summary "..." --payload '{"step":"..."}' --runtime codex --worker-id codex:session:$(hostname -s):main --json`
   - For operator-facing notes: `./scripts/concentray note add <task_id> --content "..." --kind note --json`
6. If blocked, update the task with a precise unblock request.
7. When finished, mark the task done and leave a final summary note when useful.

Always prefer structured status updates over burying state in chat.

Use `task get-next` only when you need a read-only preview of the queue and do not want to claim work yet.

## Execution mode rules

- `Autonomous`: safe for unattended pickup by OpenClaw or another background agent loop.
- `Session`: only pull this when a human explicitly asks a live Claude/Codex session for the next task.
- Keep session-only work out of unattended loops by filtering `--execution-mode autonomous`.

## Task status rules

- `pending`: queued, not started
- `in_progress`: AI is actively working
- `blocked`: AI needs a human decision, file, or clarification
- `done`: work is complete

When blocked:
- set `assignee` to `human`
- set urgency if the task is time-sensitive
- include an `input_request` payload when the UI should render a concrete unblock action

When resuming after a human response:
- read the latest task, notes, and activity again
- confirm whether the assignee is back to `AI`
- continue from the updated state rather than stale context

## Worker claim rules

- `worker_id` identifies the agent instance currently holding the task
- `active_run` records the current runtime, worker, heartbeat, and lease
- use the same stable `worker_id` for the whole session so the same agent can resume its claimed work
- when a task becomes `blocked`, `done`, or is reassigned away from `AI`, Concentray clears the claim automatically

## Notes and activity rules

Use notes for:
- decisions taken
- artifact links or filenames
- concise summaries of what changed

Use activity for:
- progress logs
- tool call inputs / outputs
- raw payloads
- autonomous AI back-and-forth that would clutter the main thread

Avoid putting verbose machine chatter into notes. Keep notes skimmable for the operator and use activity for the machine timeline.

Recommended writes:
- `activity add` for progress / execution output, preferably with `--payload` for structured payloads
- `note add --kind note` for operator-facing summaries
- `note add --kind attachment` when linking an artifact

## Input request rules

Use `input_request` only when the human needs a focused action in the UI.

Supported practical patterns:
- `choice`
- `approve_reject`
- `text_input`
- `file_or_photo`

Keep the request minimal and explicit. Good unblock requests ask for one decision, not a paragraph.

Read [references/contracts.md](references/contracts.md) for command contracts and payload examples.

## Guardrails

1. Read context before mutating status.
2. Do not mark a task `done` without either completing the work or stating the limitation clearly in activity or a note.
3. If you change ownership or status, make sure the reason is visible in activity or a note.
4. Prefer the local wrapper `./scripts/concentray` over invoking Python modules directly.
5. If no Concentray task exists for the requested work, say so and either ask for one or proceed only if the user explicitly wants an ad hoc task.

## Claude Code usage

If this skill is adapted for Claude Code, keep the same loop and command surface.

The key instruction is:
"Use Concentray as the source of truth for task state. Start with `task claim-next` using the right `--runtime` and `--execution-mode`, read `context export`, post machine traces with `activity add`, and update status with `task update`."
