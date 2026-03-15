#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"
source "$REPO_ROOT/scripts/env/runtime_profile_lib.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/runtime/launch_stack.sh <local-uatdb|uat-remote|prod-remote> [-- <next-dev args>]

Launches the canonical local runtime stack:
- local-uatdb: activates profile, starts local backend, then starts frontend
- uat-remote : activates profile, starts frontend only
- prod-remote: activates profile, starts frontend only
USAGE
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

RAW_PROFILE="${1:-}"
shift || true
NEXT_ARGS=()
if [ "${1:-}" = "--" ]; then
  shift
  NEXT_ARGS=("$@")
fi

if ! PROFILE="$(normalize_runtime_profile "$RAW_PROFILE")"; then
  echo "Invalid runtime profile: $RAW_PROFILE" >&2
  exit 1
fi

bash "$REPO_ROOT/scripts/env/use_profile.sh" "$PROFILE"

BACKEND_PID=""
cleanup() {
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [ "$(runtime_profile_backend_mode "$PROFILE")" = "local" ]; then
  bash "$REPO_ROOT/scripts/runtime/run_backend_local.sh" "$PROFILE" --skip-activate --preflight-only
  bash "$REPO_ROOT/scripts/runtime/run_backend_local.sh" "$PROFILE" --skip-activate --skip-preflight &
  BACKEND_PID=$!
  for _ in 1 2 3 4; do
    sleep 0.5
    if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      wait "$BACKEND_PID"
      exit 1
    fi
  done
fi

echo "Starting frontend on :3000 for runtime profile ${PROFILE}..."
cd "$REPO_ROOT/hushh-webapp"
if [ "${#NEXT_ARGS[@]}" -gt 0 ]; then
  npm run dev:next -- "${NEXT_ARGS[@]}"
else
  npm run dev:next
fi
