#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$REPO_ROOT/openclaw/plugin_tools/manifest.json"
ALLOWLIST_TEMPLATE="$REPO_ROOT/openclaw/policy/allowlist.toml"
PROFILE_TEMPLATE="$REPO_ROOT/openclaw/profiles/default-agent.toml"
GENERATED_DIR="$REPO_ROOT/.generated/openclaw"
ALLOWLIST="$GENERATED_DIR/allowlist.toml"
PROFILE="$GENERATED_DIR/default-agent.toml"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3.11 || command -v python3)}"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing OpenClaw manifest: $MANIFEST" >&2
  exit 1
fi

if [[ ! -f "$ALLOWLIST_TEMPLATE" ]]; then
  echo "Missing OpenClaw allowlist template: $ALLOWLIST_TEMPLATE" >&2
  exit 1
fi

if [[ ! -f "$PROFILE_TEMPLATE" ]]; then
  echo "Missing OpenClaw profile template: $PROFILE_TEMPLATE" >&2
  exit 1
fi

mkdir -p "$GENERATED_DIR"
cp "$ALLOWLIST_TEMPLATE" "$ALLOWLIST"
cp "$PROFILE_TEMPLATE" "$PROFILE"
REPO_ROOT="$REPO_ROOT" perl -pi -e 's/__REPO_ROOT__/$ENV{REPO_ROOT}/g' "$ALLOWLIST" "$PROFILE"
OPENCLAW_ALLOWLIST="$ALLOWLIST" perl -pi -e 's#__OPENCLAW_ALLOWLIST__#$ENV{OPENCLAW_ALLOWLIST}#g' "$PROFILE"

if command -v openclaw >/dev/null 2>&1; then
  echo "openclaw detected: $(openclaw --version 2>/dev/null || echo 'version unknown')"
else
  echo "openclaw command not found. Bundle is prepared; install OpenClaw to use plugin mode."
fi

if [[ "${RUN_SMOKE:-1}" == "1" ]]; then
  echo "Running OpenClaw plugin wrapper smoke check..."
  export TM_PROVIDER="${TM_PROVIDER:-local_json}"
  export TM_SKILLS_ALLOWLIST="${TM_SKILLS_ALLOWLIST:-$REPO_ROOT/apps/cli/src/concentray_cli/skills/skills.yaml}"
  export TM_UPDATED_BY="${TM_UPDATED_BY:-AI}"
  bash "$REPO_ROOT/openclaw/examples/smoke.sh" >/dev/null || {
    echo "OpenClaw smoke failed. Ensure CLI deps are installed in apps/cli." >&2
    exit 1
  }
fi

echo "OpenClaw bundle validated."
echo "Manifest: $MANIFEST"
echo "Profile:  $PROFILE"
echo "Policy:   $ALLOWLIST"
