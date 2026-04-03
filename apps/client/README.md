# @concentray/client

Expo web client for the local Concentray runtime.

## Run

Preferred path from the repo root:

```bash
./scripts/concentray start
```

Manual client run:

```bash
cd /path/to/concentray/apps/client
export EXPO_PUBLIC_LOCAL_API_URL=http://127.0.0.1:8787
export EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB=25
pnpm web
```

The client talks directly to the shared local API. It does not use a separate local-sync package.

## Architecture

- `src/data` - API helpers and wire-to-domain mapping
- `src/hooks` - overview polling, detail loading, mutations, API access
- `src/lib` - formatting and upload helpers
- `src/ui` - reusable presentation components and dialogs
- `App.tsx` - top-level shell and layout composition

Shared types come from `@concentray/contracts` through the workspace package.
Client-specific view models stay in `src/types.ts`.

## Notes

- `./scripts/concentray start` injects the client env automatically
- do not commit a fixed `apps/client/.env` pointing at one machine
- the shared local API is wildcard-CORS and intentionally local-only

## Quality checks

```bash
pnpm typecheck
pnpm test
```
