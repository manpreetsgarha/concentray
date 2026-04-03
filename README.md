# Concentray

Concentray is a local-first task coordination layer for humans and terminal AI agents.

It gives you:
- a shared task queue
- durable notes and activity logs
- blocker requests a human can answer later
- a local web UI
- a CLI that agents can call directly

Concentray does not replace Codex, Claude Code, or OpenClaw. It keeps their work organized across sessions and handoffs.

## Scope

Concentray v2 is currently built for one operator coordinating local work with one or more agents.

It is not a hosted multi-user backend, a realtime sync service, or a permissioned collaboration platform.

## Repository layout

- `apps/client` - Expo web UI
- `apps/cli` - Python CLI and local runtime
- `packages/contracts` - shared schemas and OpenClaw tool contracts
- `openclaw` - OpenClaw plugin bundle, policy, and smoke flow
- `skills/concentray-task-operator` - shared skill pack for terminal agents
- `scripts` - repo-local wrappers and bootstrap helpers

## Quick start

Install JavaScript and CLI dependencies:

```bash
pnpm install
cd apps/cli
python3 -m pip install -e '.[dev]'
cd ../..
```

Initialize the default local workspace:

```bash
./scripts/concentray init
```

Start the local API and web UI:

```bash
./scripts/concentray start
```

Default local data lives in:
- `./.data/store.json`

Default runtime URLs:
- API: `http://127.0.0.1:8787`
- Web: `http://localhost:8081`

Preferred daily checks:

```bash
./scripts/concentray doctor
./scripts/concentray status --json
./scripts/concentray stop
```

If you want the repo wrapper to resolve the CLI through `uv` instead of your installed Python environment:

```bash
CONCENTRAY_USE_UV=1 ./scripts/concentray --help
```

## Common workflows

Detached runtime:

```bash
./scripts/concentray start --background
./scripts/concentray status --json
./scripts/concentray stop
```

Expose the runtime on your LAN:

```bash
./scripts/concentray start --background --lan
./scripts/concentray status --json
```

Use an explicit advertised host:

```bash
./scripts/concentray start --background --host 0.0.0.0 --public-host 192.168.1.23
```

Runtime metadata and logs live under:
- `./.data/runtime/dev-session.json`
- `./.data/runtime/api.log`
- `./.data/runtime/web.log`

The local API is intentionally unauthenticated and serves wildcard CORS for local workflows. Keep it on trusted machines and browsers only.

## CLI examples

Claim the next task for a Codex session:

```bash
./scripts/concentray task claim-next \
  --runtime codex \
  --worker-id codex:session:$(hostname -s | tr '[:upper:]' '[:lower:]'):main \
  --status pending,in_progress \
  --execution-mode session,autonomous \
  --json
```

Respond to a blocker:

```bash
./scripts/concentray task respond task-123 \
  --response '{"type":"choice","selections":["main"]}' \
  --json
```

Record machine activity:

```bash
./scripts/concentray activity add task-123 \
  --kind tool_call \
  --summary "Step completed" \
  --payload '{"step":"build","files":2}' \
  --runtime codex \
  --worker-id codex:session:$(hostname -s | tr '[:upper:]' '[:lower:]'):main \
  --json
```

Manage saved workspaces:

```bash
./scripts/concentray workspace add --name personal --store .data/store.json --set-active
./scripts/concentray workspace list --json
./scripts/concentray workspace use personal
```

## OpenClaw

Validate the local OpenClaw bundle:

```bash
bash scripts/bootstrap/bootstrap_openclaw.sh
```

Install the generated OpenClaw agent bundle:

```bash
./scripts/concentray agent install openclaw
```

Run the wrapper smoke flow:

```bash
bash openclaw/examples/smoke.sh
```

Generated OpenClaw files are written under:
- `.generated/openclaw/default-agent.toml`
- `.generated/openclaw/allowlist.toml`

## Quality checks

Use the root scripts as the review surface:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check
```

Formatting:

```bash
pnpm format
```

## More docs

- CLI details: [`apps/cli/README.md`](/Users/manpreet/projects/task-management/apps/cli/README.md)
- Client details: [`apps/client/README.md`](/Users/manpreet/projects/task-management/apps/client/README.md)
