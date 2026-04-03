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
  --input-request '{"schema_version":"1.0","request_id":"req-choice","type":"choice","prompt":"Choose the release lane.","required":true,"created_at":"2026-03-03T10:00:00+00:00","options":["main","staging"]}' \
  --json
```

Approve/reject request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","request_id":"req-approve","type":"approve_reject","prompt":"Ship this version?","required":true,"created_at":"2026-03-03T10:00:00+00:00","approve_label":"Ship","reject_label":"Hold"}' \
  --json
```

Text input request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","request_id":"req-text","type":"text_input","prompt":"Provide the exact company tagline.","required":true,"created_at":"2026-03-03T10:00:00+00:00","max_length":200}' \
  --json
```

File or photo request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","request_id":"req-file","type":"file_or_photo","prompt":"Upload the receipt image.","required":true,"created_at":"2026-03-03T10:00:00+00:00","accept":["image/*"],"max_files":1,"max_size_mb":10}' \
  --json
```

Human response:

```bash
./scripts/concentray task respond <task_id> \
  --response '{"type":"choice","selections":["main"]}' \
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
