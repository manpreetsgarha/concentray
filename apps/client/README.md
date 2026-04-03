# @concentray/client

Expo Web-first human client for the Concentray.

## Run

```bash
pnpm install
pnpm web
```

## Architecture

The client is organized around a few clear layers:

- `src/data` handles API helpers and wire-to-domain mapping
- `src/hooks` owns shared API access helpers
- `src/lib` holds pure formatting and upload helpers
- `src/ui` contains reusable presentation components for the sidebar, task detail, attachments, and confirmation flows
- `App.tsx` is the shell that composes the task sidebar, detail pane, and creation modals

Shared domain primitives such as actor/status/execution-mode/input-request types come from `@concentray/contracts`.
Client-specific view models stay in `src/types.ts`.

## Shared local storage (UI + terminal agent)

1. Start the local shared API from the CLI workspace:

```bash
cd /path/to/concentray/apps/cli
export TM_PROVIDER=local_json
export TM_LOCAL_STORE=.data/store.json
concentray serve-local-api --host 127.0.0.1 --port 8787
```

2. For a manual Expo run, export the client env before starting web:

```bash
export EXPO_PUBLIC_LOCAL_API_URL=http://127.0.0.1:8787
export EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB=25
pnpm web
```

Now the web app and terminal agent both read/write the same local store.

When using `./scripts/concentray start`, the CLI injects these variables automatically. Do not commit a project-local `apps/client/.env` with a fixed API URL.

## Quality checks

```bash
pnpm typecheck
pnpm test
```

Attachment types supported in the comment thread:

- photos (`image/*`)
- videos (`video/*`)
- text (`.txt`)
- csv (`.csv`)
