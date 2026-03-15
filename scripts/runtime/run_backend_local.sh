#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"
source "$REPO_ROOT/scripts/env/runtime_profile_lib.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/runtime/run_backend_local.sh <local-uatdb> [--skip-activate] [--preflight-only] [--skip-preflight]

Starts the local backend for a runtime profile.
For local-uatdb, this will start a Cloud SQL proxy automatically when the
active backend profile includes CLOUDSQL_INSTANCE_CONNECTION_NAME.
USAGE
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

RAW_PROFILE="${1:-}"
shift || true
SKIP_ACTIVATE=false
PREFLIGHT_ONLY=false
SKIP_PREFLIGHT=false

for arg in "$@"; do
  case "$arg" in
    --skip-activate)
      SKIP_ACTIVATE=true
      ;;
    --preflight-only)
      PREFLIGHT_ONLY=true
      ;;
    --skip-preflight)
      SKIP_PREFLIGHT=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

if ! PROFILE="$(normalize_runtime_profile "$RAW_PROFILE")"; then
  echo "Invalid runtime profile: $RAW_PROFILE" >&2
  exit 1
fi

if [ "$(runtime_profile_backend_mode "$PROFILE")" != "local" ]; then
  echo "Runtime profile $PROFILE does not start a local backend." >&2
  echo "Use a remote profile with 'make web PROFILE=$PROFILE' or 'make stack PROFILE=$PROFILE'." >&2
  exit 1
fi

if [ "$SKIP_ACTIVATE" != "true" ]; then
  bash "$REPO_ROOT/scripts/env/use_profile.sh" "$PROFILE"
fi

BACKEND_ENV_FILE="$REPO_ROOT/consent-protocol/.env"
if [ ! -f "$BACKEND_ENV_FILE" ]; then
  echo "Missing active backend env file: $BACKEND_ENV_FILE" >&2
  exit 1
fi

read_env_value() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
needle = f"{key}="
if not path.exists():
    print("")
    raise SystemExit(0)
for line in path.read_text(encoding="utf-8").splitlines():
    if line.startswith(needle):
        print(line.split("=", 1)[1])
        break
else:
    print("")
PY
}

wait_for_port() {
  local host="$1"
  local port="$2"
  python3 - "$host" "$port" <<'PY'
import socket
import sys
import time

host = sys.argv[1]
port = int(sys.argv[2])
end = time.time() + 10
while time.time() < end:
    try:
        with socket.create_connection((host, port), timeout=0.5):
            raise SystemExit(0)
    except OSError:
        time.sleep(0.25)
raise SystemExit(1)
PY
}

port_is_listening() {
  local host="$1"
  local port="$2"
  python3 - "$host" "$port" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
with socket.socket() as sock:
    sock.settimeout(0.2)
    raise SystemExit(0 if sock.connect_ex((host, port)) == 0 else 1)
PY
}

verify_iam_readiness() {
  local profile="$1"
  if [ "$profile" != "local-uatdb" ]; then
    return 0
  fi

  echo "Verifying IAM schema readiness for ${profile}..."
  (
    cd "$REPO_ROOT/consent-protocol"
    PYTHONPATH=. python3 scripts/verify_iam_schema.py
  )
}

run_preflight() {
  local profile="$1"
  verify_iam_readiness "$profile"

  if port_is_listening 127.0.0.1 8000; then
    echo "Backend port 8000 is already in use." >&2
    echo "Stop the existing backend process before starting ${profile}." >&2
    exit 1
  fi
}

PROXY_PID=""
cleanup() {
  if [ -n "$PROXY_PID" ] && kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    kill "$PROXY_PID" >/dev/null 2>&1 || true
    wait "$PROXY_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

DB_HOST="$(read_env_value "$BACKEND_ENV_FILE" 'DB_HOST')"
DB_PORT="$(read_env_value "$BACKEND_ENV_FILE" 'DB_PORT')"
DB_PORT="${DB_PORT:-5432}"
INSTANCE="$(read_env_value "$BACKEND_ENV_FILE" 'CLOUDSQL_INSTANCE_CONNECTION_NAME')"
PROXY_PORT="$(read_env_value "$BACKEND_ENV_FILE" 'CLOUDSQL_PROXY_PORT')"
PROXY_PORT="${PROXY_PORT:-$DB_PORT}"

if [ -n "$INSTANCE" ] && [[ "$DB_HOST" == "127.0.0.1" || "$DB_HOST" == "localhost" ]]; then
  if python3 - "$PROXY_PORT" <<'PY'
import socket
import sys
port = int(sys.argv[1])
with socket.socket() as sock:
    sock.settimeout(0.2)
    sys.exit(0 if sock.connect_ex(("127.0.0.1", port)) == 0 else 1)
PY
  then
    echo "Assuming an existing DB listener is already running on 127.0.0.1:${PROXY_PORT} for ${INSTANCE}."
  else
    if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
      echo "local-uatdb requires cloud-sql-proxy to reach the UAT Cloud SQL instance." >&2
      echo "Install it and rerun, or provide a reachable DB_HOST override in consent-protocol/.env.local-uatdb.local." >&2
      exit 1
    fi
    echo "Starting Cloud SQL proxy for ${INSTANCE} on 127.0.0.1:${PROXY_PORT}..."
    cloud-sql-proxy --address 127.0.0.1 --port "$PROXY_PORT" "$INSTANCE" >/tmp/hushh-cloud-sql-proxy.log 2>&1 &
    PROXY_PID=$!
    if ! wait_for_port 127.0.0.1 "$PROXY_PORT"; then
      echo "Cloud SQL proxy failed to bind 127.0.0.1:${PROXY_PORT}. See /tmp/hushh-cloud-sql-proxy.log" >&2
      exit 1
    fi
  fi
fi

if [ "$SKIP_PREFLIGHT" != "true" ]; then
  run_preflight "$PROFILE"
fi

if [ "$PREFLIGHT_ONLY" = "true" ]; then
  echo "Backend preflight passed for runtime profile ${PROFILE}."
  exit 0
fi

echo "Starting backend on :8000 for runtime profile ${PROFILE}..."
cd "$REPO_ROOT/consent-protocol"
python3 -m uvicorn server:app --reload --port 8000
