# Concentray CLI contracts

Use the repo-local wrapper from the repository root:

```bash
./scripts/concentray ...
```

## Core commands

Claim next AI task for a stable worker id:

```bash
./scripts/concentray task claim-next --worker-id codex-$(hostname -s) --assignee ai --status pending,in_progress --json
```

Inspect next AI task without claiming it:

```bash
./scripts/concentray task get-next --assignee ai --status pending,in_progress --json
```

Get task with comments:

```bash
./scripts/concentray task get <task_id> --with-comments --json
```

Export structured context:

```bash
./scripts/concentray context export <task_id> --format json --json
```

Add progress comment:

```bash
./scripts/concentray comment add <task_id> --message "Implemented parser changes" --type log --metadata '{"step":"parser","payload":{"files_changed":2}}' --json
```

Mark done:

```bash
./scripts/concentray task update <task_id> --status done --assignee human --json
```

Refresh or set the active worker claim explicitly:

```bash
./scripts/concentray task update <task_id> --worker-id codex-$(hostname -s) --json
```

## Blocker examples

Choice request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --urgency 5 \
  --input-request '{"schema_version":"1.0","type":"choice","options":["main","staging"]}' \
  --json
```

Approve/reject request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --input-request '{"schema_version":"1.0","type":"approve_reject","prompt":"Ship this version?"}' \
  --json
```

Text input request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --input-request '{"schema_version":"1.0","type":"text_input","prompt":"Provide the exact company tagline."}' \
  --json
```

File or photo request:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --input-request '{"schema_version":"1.0","type":"file_or_photo","prompt":"Upload the receipt image."}' \
  --json
```

## Notes

- `task update` supports `pending`, `in_progress`, `blocked`, `done`
- `assignee` supports `ai`, `human`
- prefer `task claim-next` over `task get-next` when starting work
- `worker_id` + `claimed_at` prevent duplicate pickup across agent runtimes
- use `log` comments for verbose autonomous traces and raw payloads
- keep `message` / `decision` / `attachment` comments operator-facing
- prefer comments for progress and `task update` for lifecycle changes
