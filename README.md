# Concentray

Concentray is a local-first task coordination layer for humans and terminal AI agents.

It gives you a shared system for:
- queued work
- structured task context
- human notes and machine activity
- blocker requests that a human can resolve later
- a web UI for monitoring and unblocking
- a CLI that agents can call directly

The important distinction is:
- Codex, Claude Code, or OpenClaw do the work
- Concentray keeps the work organized across sessions, devices, and human handoffs

## Current scope

Concentray v2 is currently a single-operator system.

It is built for one person coordinating work with one or more AI agents through a shared local runtime.

It is not yet:
- a multi-user team product
- a shared-account collaboration backend
- a realtime hosted sync system
- a permissioned workspace platform

## Why this exists

Directly asking an agent in chat is better for one-off tasks.

Concentray becomes useful when work is:
- ongoing instead of one-shot
- spread across multiple life or work lanes
- likely to block on human decisions
- valuable to review from phone or web later
- worth preserving after the chat session ends
- shared across multiple agents or multiple runs

Good fits:
- startup or product execution
- job search pipelines
- personal operations and admin
- long-running coding or research work
- agent loops where you want status, logs, and unblock actions in one place

Bad fits:
- trivial one-command tasks
- purely synchronous work where you stay in the terminal the whole time
- cases where task tracking would just add ceremony

## How it works

Concentray v2 is intentionally local-first.

Source of truth:
- local JSON task store

The local JSON store is an internal development datastore for v2. Schema compatibility across versions is not guaranteed.
If the store schema changes, reinitialize the workspace instead of expecting automatic migration.

Human side:
- Expo web UI
- local API

Agent side:
- Python CLI
- JSON-first command contracts

Optional agent adapters:
- Codex skill
- Claude Code skill + subagent + slash command
- OpenClaw plugin tools + fallback skill

Current shared local runtime:
1. `./scripts/concentray init`
2. `./scripts/concentray start`
3. web UI and terminal agents use the same local store/runtime

## Repository layout

- `apps/client` - Expo web client
- `apps/cli` - Python CLI
- `packages/contracts` - shared schemas and OpenClaw tool schemas
- `openclaw` - OpenClaw plugin and skill bundle
- `skills/concentray-task-operator` - shared Codex / Claude-oriented skill bundle
- `scripts` - repo-local wrappers and bootstrap scripts

## Architecture flow

Concentray is intentionally split so each layer has a narrow job:

- UI and operator workflows live in `apps/client`
- command handling, local runtime orchestration, and agent installers live in `apps/cli`
- shared task/input-request contracts live in `packages/contracts`
- client-side state stays in the Expo app and talks to the local API directly

Runtime flow:

1. The web UI or CLI issues task, note, activity, and workspace actions.
2. The CLI runtime resolves the active provider and local store.
3. Shared contracts define the payload shape across UI, CLI, and agent adapters.
4. The local JSON store remains the source of truth for v2.
5. `@concentray/contracts` is consumed through the workspace package during development, with `dist/` used only as generated build output.

## Quick start

### 1. Install dependencies

```bash
pnpm install
cd apps/cli
python3 -m pip install -e '.[dev]'
cd ../..
```

### 2. Initialize local workspace

```bash
./scripts/concentray init
```

This creates the default workspace and store at:
- `./.data/store.json`

### 3. Start the local runtime

```bash
./scripts/concentray start
```

This starts:
- local API, default `http://127.0.0.1:8787`
- Expo web app, default `http://localhost:8081`

## Engineering workflow

Root scripts are the intended review surface for code quality:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check
```

Optional formatting helpers:

```bash
pnpm format
```

`pnpm check` is what CI runs on pull requests.

If a port is busy, Concentray will pick the next free one.

To detach the runtime into the background:

```bash
./scripts/concentray start --background
./scripts/concentray status --json
./scripts/concentray stop
```

To expose the web UI and API on your local network:

```bash
./scripts/concentray start --background --lan
./scripts/concentray status --json
```

`--lan` auto-detects the machine's LAN IP and prints the reachable local-network URLs. If detection is wrong for your network, override it with:

```bash
./scripts/concentray start --background --host 0.0.0.0 --public-host 192.168.1.23
```

Background metadata and logs live under:
- `./.data/runtime/dev-session.json`
- `./.data/runtime/api.log`
- `./.data/runtime/web.log`

The shared local API is intentionally unauthenticated and currently serves wildcard CORS for local-only workflows. Do not expose it beyond machines and browsers you trust.

Background web mode serves a static exported web bundle from `.data/runtime/web-dist` through a local HTTP server. Foreground `start` still uses the Expo dev server.

### 4. Open the web UI

Open the URL printed by `start`.

The UI lets you:
- switch workspaces
- create tasks
- delete tasks with confirmation
- mark tasks done
- inspect task details
- keep operator-facing notes separate from verbose AI activity
- add notes and attachments
- respond to blocker requests

## The simplest way to use it

Human:
```bash
./scripts/concentray init
./scripts/concentray start
```

Agent:
```bash
./scripts/concentray task claim-next --runtime codex --worker-id codex:session:$(hostname -s):main --status pending,in_progress --execution-mode session,autonomous --json
```

That is the core v2 loop.

## Why it is useful with agents

Without Concentray:
- work lives in the current chat
- state is fragile
- progress is hard to monitor later
- blockers are handled ad hoc
- switching agents means re-explaining context

With Concentray:
- tasks survive session resets
- progress and decisions are logged
- a human can unblock from the UI later
- multiple agents can work against one queue
- the task system becomes the durable coordination surface

## Command surface

The repo-local wrapper is the preferred entrypoint:

```bash
./scripts/concentray
```

Installed command aliases:
- `concentray`
- `ctray`

### Everyday commands

Initialize the default workspace:

```bash
./scripts/concentray init
```

Check local machine readiness:

```bash
./scripts/concentray doctor
```

Start local API + web UI:

```bash
./scripts/concentray start
```

Start local API + web UI in the background:

```bash
./scripts/concentray start --background
```

Inspect or stop the detached runtime:

```bash
./scripts/concentray status --json
./scripts/concentray stop
```

Start only the local API:

```bash
./scripts/concentray serve-local-api --host 127.0.0.1 --port 8787
```

Claim next task for AI:

```bash
./scripts/concentray task claim-next --runtime codex --worker-id codex:session:$(hostname -s):main --status pending,in_progress --execution-mode session,autonomous --json
```

Inspect next task for AI without claiming it:

```bash
./scripts/concentray task get-next --runtime codex --worker-id codex:session:$(hostname -s):main --status pending,in_progress --execution-mode session,autonomous --json
```

Get a task with notes, activity, and active run state:

```bash
./scripts/concentray task get <task_id> --json
```

Update a task:

```bash
./scripts/concentray task update <task_id> --status blocked --assignee human --ai-urgency 5 --runtime codex --worker-id codex:session:$(hostname -s):main --json
```

Delete a task:

```bash
./scripts/concentray task delete <task_id> --json
```

Add machine activity:

```bash
./scripts/concentray activity add <task_id> --kind tool_call --summary "Investigating parser failure" --payload '{"step":"parse","file":"report.csv","attempt":2}' --runtime codex --worker-id codex:session:$(hostname -s):main --json
```

Add a human note:

```bash
./scripts/concentray note add <task_id> --content "Waiting on the final screenshot before release." --kind note --json
```

Task timeline model:
- `notes` are human-facing updates and attachments
- `activity` is the append-only machine timeline for tool traces, lifecycle events, check-ins, and recovery
- the task drawer exposes those in separate `Notes` and `Activity` views

Export task context:

```bash
./scripts/concentray context export <task_id> --format json --json
```

### Advanced hidden commands

Workspace management:

```bash
./scripts/concentray workspace status --json
./scripts/concentray workspace add --name personal --store .data/workspaces/personal.json --set-active --json
./scripts/concentray workspace list --json
./scripts/concentray workspace use personal --json
./scripts/concentray workspace remove personal --json
```

Agent installers:

```bash
./scripts/concentray agent install codex
./scripts/concentray agent install claude
./scripts/concentray agent install openclaw
```

Internal allowlisted skill execution:

```bash
./scripts/concentray skill run <skill_id> --task <task_id> --json
```

## Task and blocker flow

Typical agent loop:

1. claim next AI task with a stable `worker_id`
2. read task, notes, activity, and active run state
3. export structured context
4. do the work
5. heartbeat during long work and append activity
6. if blocked, update task with a focused `input_request`
7. human responds in the UI or with `task respond`
8. agent resumes
9. mark task done

Example blocked update:

```bash
./scripts/concentray task update <task_id> \
  --status blocked \
  --assignee human \
  --ai-urgency 5 \
  --runtime codex \
  --worker-id codex:session:$(hostname -s):main \
  --input-request '{"schema_version":"1.0","request_id":"req-lane","type":"choice","prompt":"Choose the release lane.","required":true,"created_at":"2026-03-03T10:00:00+00:00","options":["main","staging"]}' \
  --json
```

Human unblock response:

```bash
./scripts/concentray task respond <task_id> \
  --response '{"type":"choice","selections":["main"]}' \
  --json
```

Supported practical unblock request types:
- `choice`
- `approve_reject`
- `text_input`
- `file_or_photo`

Response payload shapes:
- `choice` -> `{"type":"choice","selections":["main"]}`
- `approve_reject` -> `{"type":"approve_reject","approved":true}`
- `text_input` -> `{"type":"text_input","value":"Exact requested text"}`
- `file_or_photo` -> `{"type":"file_or_photo","files":[{...attachment metadata...}]}`

Worker claim behavior:
- `worker_id` identifies which agent instance currently owns the task
- `active_run.started_at` records when that claim was taken
- `task claim-next --execution-mode autonomous` is the safe pickup path for unattended agents
- `task claim-next --execution-mode session,autonomous` is the live-session pickup path when you explicitly ask Claude/Codex for the next task
- `task get-next` is for read-only inspection
- claims clear automatically when a task becomes `blocked`, `done`, or is reassigned away from `AI`

## Workspaces

A workspace is the top-level container for one lane of work.

Examples:
- startup
- job search
- life ops
- research

Most users do not need to think about workspaces at first.

Default behavior:
- `init` creates `default`
- normal commands use the active workspace automatically
- advanced users can add and switch workspaces with `workspace ...`

Workspace config lives in:
- `~/.config/concentray/workspaces.json`

Overrides:
- `TM_WORKSPACE_CONFIG`
- `TM_WORKSPACE`

## Web UI

Current web UI supports:
- collapsible workspace sidebar
- create workspace
- create task from modal
- task list as the primary view
- task detail drawer
- status updates including done / reopen
- notes, activity, and attachments
- blocker resolution UI

It is designed for the human operator side of the loop.

## Attachments and rich files

Shared local API mode supports:
- photos (`image/*`)
- videos (`video/*`)
- text (`.txt`, `text/plain`)
- csv (`.csv`, `text/csv`)

This means tasks and notes can carry richer artifacts, not just text.

## Agent installs

Concentray ships out-of-box install helpers for different agent runtimes.

### Codex

Install the bundled skill into your Codex skills home:

```bash
./scripts/concentray agent install codex
```

This installs:
- `~/.codex/skills/concentray-task-operator/`

You can also install to a custom Codex home:

```bash
./scripts/concentray agent install codex --path /custom/codex-home
```

### Claude Code

Install a Claude Code project pack:

```bash
./scripts/concentray agent install claude
```

This writes:
- `.claude/skills/concentray-task-operator/`
- `.claude/agents/concentray-operator.md`
- `.claude/commands/concentray-next.md`

Use `--scope user` to target `~/.claude` instead of project-local `.claude/`.

### OpenClaw

Install the OpenClaw integration:

```bash
./scripts/concentray agent install openclaw
```

This now does two things:
- prepares the Concentray OpenClaw bundle
- registers the local plugin with OpenClaw when the `openclaw` binary is available on that machine

It generates:
- `.generated/openclaw/default-agent.toml`
- `.generated/openclaw/allowlist.toml`

OpenClaw is plugin-first.

The OpenClaw bundle contains:
- native plugin root: `openclaw/plugin/`
- OpenClaw plugin manifest: `openclaw/plugin/openclaw.plugin.json`
- wrapper runner: `openclaw/plugin_tools/invoke_tool.py`
- fallback skill: `openclaw/SKILL.md`

Smoke test the wrappers directly:

```bash
bash openclaw/examples/smoke.sh
```

## Integration model by tool

### Codex

Best fit:
- skill-first
- direct CLI calls through `./scripts/concentray`

### Claude Code

Best fit:
- skill-first
- project subagent / slash command convenience layer
- direct CLI calls through `./scripts/concentray`

### OpenClaw

Best fit:
- plugin-first
- typed tool wrappers over the same CLI
- fallback skill only when plugin mode is unavailable
- use `task_claim_next` for safe pickup
- use `activity_add(payload=...)` for verbose trace data; human notes stay in `note add`

This keeps one consistent core:
- shared CLI contract
- shared workflow
- thin tool-specific adapters

## Environment

Examples live in:
- `apps/cli/.env.example`
- `apps/client/.env.example`

Useful variables:
- `TM_PROVIDER=local_json`
- `TM_LOCAL_STORE=.data/store.json`
- `TM_LOCAL_MAX_UPLOAD_MB=25`
- `TM_WORKSPACE_CONFIG=/path/to/workspaces.json`
- `TM_WORKSPACE=default`
- `EXPO_PUBLIC_LOCAL_API_URL=http://127.0.0.1:8787`
- `EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB=25`

Notes:
- `./scripts/concentray start` injects the Expo client env automatically.
- relative `TM_LOCAL_STORE` values resolve from the repo root, not the current shell directory.
- do not commit a fixed `apps/client/.env` with a hardcoded API URL; use env vars or an untracked local file for manual Expo runs.

## Testing

Run all core tests:

```bash
cd apps/cli && python3 -m pytest -q
```

OpenClaw wrapper smoke:

```bash
bash openclaw/examples/smoke.sh
```

## Current v2 scope

Supported and real:
- local-first runtime
- local JSON store
- local API
- web UI
- task / comment / context CLI
- worker claim semantics for multi-agent-safe pickup
- workspace switching
- attachments in shared API mode
- Codex skill install
- Claude Code pack install
- OpenClaw plugin bundle

Deferred:
- hosted backend
- true remote push notifications
- cross-device backend sync
- direct remote provider mode as the main product path

## Summary

Concentray is useful when you want AI agents to operate against a durable queue with human review and unblock loops, instead of losing work inside one terminal session or one chat thread.

If you want one-shot execution, just use the agent directly.
If you want an ongoing human-plus-agent operating system, use Concentray.
