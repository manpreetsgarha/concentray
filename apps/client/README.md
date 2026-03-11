# @concentray/client

Expo Web-first human client for the Concentray.

## Run

```bash
pnpm install
pnpm web
```

## Shared local storage (UI + terminal agent)

1. Start the local shared API from the CLI workspace:

```bash
cd /path/to/concentray/apps/cli
export TM_PROVIDER=local_json
export TM_LOCAL_STORE=.data/store.json
concentray serve-local-api --host 127.0.0.1 --port 8787
```

2. Set this in `apps/client/.env`:

```bash
EXPO_PUBLIC_LOCAL_API_URL=http://127.0.0.1:8787
EXPO_PUBLIC_LOCAL_UPLOAD_MAX_MB=25
```

Now the web app and terminal agent both read/write the same local store.

Attachment types supported in the comment thread:

- photos (`image/*`)
- videos (`video/*`)
- text (`.txt`)
- csv (`.csv`)
