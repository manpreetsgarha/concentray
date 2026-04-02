# Concentray CLI contracts

Use the repo-local wrapper from the repository root:

```bash
./scripts/concentray ...
```

## Core commands

Claim next AI task for a stable worker id:

```bash
./scripts/concentray task claim-next --runtime codex --worker-id codex:session:$(hostname -s):main --status pending,in_progress --execution-mode session,autonomous --json
```

Inspect next AI task without claiming it:

```bash
./scripts/concentray task get-next --runtime codex --worker-id codex:session:$(hostname -s):main --status pending,in_progress --execution-mode session,autonomous --json
```

Get task with notes and activity:

```bash
./scripts/concentray task get <task_id> --json
```

Export structured context:

```bash
./scripts/concentray context export <task_id> --format json --json
```

Add progress activity:

```bash
./scripts/concentray activity add <task_id> --kind tool_call --summary "Implemented parser changes" --payload '{"step":"parser","files_changed":2}' --runtime codex --worker-id codex:session:$(hostname -s):main --json
```

Mark done:

```bash
./scripts/concentray task update <task_id> --status done --assignee human --runtime codex --worker-id codex:session:$(hostname -s):main --json
```

Refresh the active worker lease explicitly:

```bash
./scripts/concentray task heartbeat <task_id> --runtime codex --worker-id codex:session:$(hostname -s):main --json
```

## Blocker examples

Choice request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --ai-urgency 5 \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","type":"choice","options":["main","staging"]}' \
  --json
```

Approve/reject request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","type":"approve_reject","prompt":"Ship this version?"}' \
  --json
```

Text input request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","type":"text_input","prompt":"Provide the exact company tagline."}' \
  --json
```

File or photo request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","type":"file_or_photo","prompt":"Upload the receipt image."}' \
  --json
```

## Notes

- `task update` supports `pending`, `in_progress`, `blocked`, `done`
- `assignee` supports `ai`, `human`
- prefer `task claim-next` over `task get-next` when starting work
- `worker_id` + the active run lease prevent duplicate pickup across agent runtimes
- use `activity add` for verbose autonomous traces and raw payloads
- keep `note add` operator-facing
- prefer activity for progress and `task update` for lifecycle changes
