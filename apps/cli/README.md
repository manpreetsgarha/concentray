# concentray-cli

Python CLI and local runtime for Concentray.

## Install

Editable install:

```bash
python3 -m pip install -e '.[dev]'
```

Repo-local wrapper:

```bash
cd /path/to/concentray
./scripts/concentray --help
```

Optional `uv` path:

```bash
CONCENTRAY_USE_UV=1 ./scripts/concentray --help
```

## Main commands

Everyday entrypoints:
- `init`
- `doctor`
- `start`
- `serve-local-api`
- `status`
- `stop`
- `task ...`
- `note ...`
- `activity ...`
- `context ...`

Advanced command groups are intentionally hidden from default help, but still available:
- `workspace ...`
- `skill ...`
- `agent ...`
- `runtime ...`

## Local workflow

Initialize the default workspace and store:

```bash
concentray init
```

Start the shared API and web UI:

```bash
concentray start
```

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

## Provider and store

Default provider:

```bash
TM_PROVIDER=local_json
```

Default shared store:

```bash
TM_LOCAL_STORE=./.data/store.json
```

The local JSON store is a development datastore, not a stable migration surface. If the schema changes, reinitialize the workspace instead of expecting automatic migration.

Relative `TM_LOCAL_STORE` paths resolve from the repo root.

## Common commands

Inspect the queue:

```bash
concentray task get-next \
  --runtime codex \
  --worker-id codex:session:$(hostname -s | tr '[:upper:]' '[:lower:]'):main \
  --status pending,in_progress \
  --execution-mode session,autonomous \
  --json
```

Claim a task:

```bash
concentray task claim-next \
  --runtime codex \
  --worker-id codex:session:$(hostname -s | tr '[:upper:]' '[:lower:]'):main \
  --status pending,in_progress \
  --execution-mode session,autonomous \
  --json
```

Respond to a blocker:

```bash
concentray task respond task-123 --response '{"type":"choice","selections":["main"]}' --json
```

Add machine activity:

```bash
concentray activity add task-123 \
  --kind tool_call \
  --summary "Step completed" \
  --payload '{"step":"build"}' \
  --runtime codex \
  --worker-id codex:session:$(hostname -s | tr '[:upper:]' '[:lower:]'):main \
  --json
```

Manage saved workspaces:

```bash
concentray workspace add --name personal --store .data/store.json --set-active
concentray workspace list --json
concentray workspace use personal
concentray workspace status --json
```

## Local API

Run only the local API:

```bash
export TM_PROVIDER=local_json
export TM_LOCAL_STORE=.data/store.json
export TM_LOCAL_MAX_UPLOAD_MB=25
concentray serve-local-api --host 127.0.0.1 --port 8787
```

This API is intentionally local-only, unauthenticated, and wildcard-CORS.

## OpenClaw

Validate the local bundle:

```bash
bash scripts/bootstrap/bootstrap_openclaw.sh
```

Install the OpenClaw agent pack:

```bash
concentray agent install openclaw
```

Run the wrapper smoke flow:

```bash
bash openclaw/examples/smoke.sh
```

## Quality checks

```bash
python3 -m ruff check src tests
python3 -m pytest -q
```
