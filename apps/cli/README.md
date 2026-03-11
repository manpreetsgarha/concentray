# concentray-cli

Python CLI for the Concentray collaboration model.

## Run locally

```bash
python3.11 -m pip install -e '.[dev]'
concentray --help
```

Command aliases after install:

- `concentray` (primary)
- `ctray` (compat alias)

Default CLI help is intentionally simplified for onboarding and daily use.
Advanced commands remain available (e.g. `workspace ...`, `skill run`), but are hidden from default help output.
Agent installers are also available as hidden advanced commands.

No-install repo-local wrapper:

```bash
cd /path/to/concentray
./scripts/concentray --help
```

## Quick OSS flow

```bash
concentray init
concentray start
```

- `init` sets up local mode by default
- `start` runs local API + web app together for shared human/agent workflow

Detached mode:

```bash
concentray start --background
concentray status --json
concentray stop
```

LAN mode:

```bash
concentray start --background --lan
concentray status --json
```

Advanced override when you want wildcard bind plus an explicit advertised host:

```bash
concentray start --background --host 0.0.0.0 --public-host 192.168.1.23
```

Runtime metadata and logs are written under `.data/runtime/`.
Detached web mode serves a static exported bundle from `.data/runtime/web-dist`.

Precheck your machine:

```bash
concentray doctor
```

## Default provider

`TM_PROVIDER=local_json`

## Saved workspaces

The CLI can keep reusable workspace profiles in:

- `~/.config/concentray/workspaces.json`
- override path with `TM_WORKSPACE_CONFIG=/path/to/workspaces.json`

Create/switch:

```bash
concentray workspace add --name personal --store .data/store.json --set-active
concentray workspace list --json
concentray workspace use personal
concentray workspace status --json
```

v1 is intentionally local-first.

## Example

```bash
concentray task claim-next --worker-id codex-main --assignee ai --status pending,in_progress --json
```

Read-only queue inspection still uses:

```bash
concentray task get-next --assignee ai --status pending,in_progress --json
```

Delete a task:

```bash
concentray task delete task-123 --json
```

Structured verbose log example:

```bash
concentray comment add task-123 --message "Step completed" --type log --metadata '{"step":"build","payload":{"files":2}}' --json
```

Use `log` comments for machine-oriented traces and raw payloads. Keep `message`, `decision`, and `attachment` comments operator-facing.

Claim semantics:

- `worker_id` identifies the active agent instance
- `claimed_at` records when work was claimed
- `task claim-next` is the safe pickup path
- claims clear automatically on `blocked`, `done`, or reassignment away from `AI`

## Local shared API (for web + terminal collaboration)

```bash
export TM_PROVIDER=local_json
export TM_LOCAL_STORE=.data/store.json
export TM_LOCAL_MAX_UPLOAD_MB=25
concentray serve-local-api --host 127.0.0.1 --port 8787
```

Rich document uploads in shared API mode support:

- photos (`image/*`)
- videos (`video/*`)
- text (`.txt`, `text/plain`)
- csv (`.csv`, `text/csv`)

## OpenClaw

Concentray ships with an OpenClaw bundle under `/openclaw`.

Preferred tool usage:

- `task_claim_next` to start work
- `task_get_next` only for inspection

Important runtime rule:

- point OpenClaw at the same local store/workspace as the UI
- default shared store is `.data/store.json` at the repo root

Validate the bundle:

```bash
cd /path/to/concentray
bash scripts/bootstrap/bootstrap_openclaw.sh
```

This writes a resolved OpenClaw profile to:

- `.generated/openclaw/default-agent.toml`
- `.generated/openclaw/allowlist.toml`

Run the wrapper smoke flow:

```bash
cd /path/to/concentray
bash openclaw/examples/smoke.sh
```

## Agent installers

Install Concentray packs for different agent runtimes:

```bash
concentray agent install codex
concentray agent install claude
concentray agent install openclaw
```

Claude install creates a project-local pack under `.claude/`:

- `skills/concentray-task-operator/`
- `agents/concentray-operator.md`
- `commands/concentray-next.md`
