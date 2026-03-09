#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/env/bootstrap_profiles.sh [options]

Options:
  --region <region>                  Cloud Run region (default: us-central1)
  --backend-service <name>           Backend service name (default: consent-protocol)
  --frontend-service <name>          Frontend service name (default: hushh-webapp)
  --uat-project <project-id>         UAT project id (default: hushh-pda-uat)
  --prod-project <project-id>        Prod project id (default: hushh-pda)
  --force                            Re-copy templates before hydration
  --strict                           Exit non-zero if required cloud values are missing
  -h, --help                         Show this help

Description:
  Creates and hydrates local profile files:
    consent-protocol/.env.dev.local
    consent-protocol/.env.uat.local
    consent-protocol/.env.prod.local
    hushh-webapp/.env.dev.local
    hushh-webapp/.env.uat.local
    hushh-webapp/.env.prod.local

  Sources:
  - dev profile: current local active files (.env / .env.local)
  - uat/prod profiles: GCP Secret Manager + Cloud Run service runtime env

Notes:
  - No secret values are printed.
  - Generated local profiles are chmod 600.
EOF
}

REGION="${REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-consent-protocol}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-hushh-webapp}"
UAT_PROJECT_ID="${UAT_PROJECT_ID:-hushh-pda-uat}"
PROD_PROJECT_ID="${PROD_PROJECT_ID:-hushh-pda}"
FORCE=false
STRICT=false

while [ "$#" -gt 0 ]; do
  case "${1:-}" in
    --region)
      REGION="${2:-}"
      shift 2
      ;;
    --backend-service)
      BACKEND_SERVICE="${2:-}"
      shift 2
      ;;
    --frontend-service)
      FRONTEND_SERVICE="${2:-}"
      shift 2
      ;;
    --uat-project)
      UAT_PROJECT_ID="${2:-}"
      shift 2
      ;;
    --prod-project)
      PROD_PROJECT_ID="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --strict)
      STRICT=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd gcloud
require_cmd jq
require_cmd python3

REPO_ROOT="$(git rev-parse --show-toplevel)"
BACKEND_DIR="$REPO_ROOT/consent-protocol"
FRONTEND_DIR="$REPO_ROOT/hushh-webapp"

BACKEND_ACTIVE="$BACKEND_DIR/.env"
FRONTEND_ACTIVE="$FRONTEND_DIR/.env.local"

CACHE_DIR="$(mktemp -d)"
trap 'rm -rf "$CACHE_DIR"' EXIT

declare -a SUMMARY
declare -a WARNINGS
declare -a MISSING_REQUIRED

read_env_value() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    echo ""
    return 0
  fi
  python3 - "$file" "$key" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
needle = f"{key}="

for line in path.read_text(encoding="utf-8").splitlines():
    if line.startswith(needle):
        print(line.split("=", 1)[1])
        break
else:
    print("")
PY
}

upsert_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  VALUE="$value" python3 - "$file" "$key" <<'PY'
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
value = os.environ.get("VALUE", "")
needle = f"{key}="

if path.exists():
    lines = path.read_text(encoding="utf-8").splitlines()
else:
    lines = []

replaced = False
for idx, line in enumerate(lines):
    if line.startswith(needle):
        lines[idx] = f"{key}={value}"
        replaced = True
        break

if not replaced:
    if lines and lines[-1].strip():
        lines.append("")
    lines.append(f"{key}={value}")

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

copy_template_if_needed() {
  local template="$1"
  local target="$2"
  if [ ! -f "$template" ]; then
    echo "Missing template: $template" >&2
    exit 1
  fi
  if [ ! -f "$target" ] || [ "$FORCE" = "true" ]; then
    cp "$template" "$target"
    SUMMARY+=("copied template -> ${target#$REPO_ROOT/}")
  fi
}

get_secret_value() {
  local project="$1"
  local secret="$2"
  local value=""
  if value="$(gcloud secrets versions access latest --secret="$secret" --project="$project" 2>/dev/null)"; then
    value="${value%$'\n'}"
    value="${value%$'\r'}"
    printf '%s' "$value"
    return 0
  fi
  return 1
}

service_json_path() {
  local project="$1"
  local service="$2"
  local out="$CACHE_DIR/${project}_${service}.json"
  if [ ! -f "$out" ]; then
    if ! gcloud run services describe "$service" \
      --project="$project" \
      --region="$REGION" \
      --format=json >"$out" 2>/dev/null; then
      echo "{}" >"$out"
      WARNINGS+=("cloud run describe failed for ${project}/${service}")
    fi
  fi
  echo "$out"
}

run_env_value() {
  local project="$1"
  local service="$2"
  local key="$3"
  local json_file
  json_file="$(service_json_path "$project" "$service")"
  jq -r --arg key "$key" '.spec.template.spec.containers[0].env[]? | select(.name==$key) | (.value // empty)' "$json_file" | head -n1
}

run_service_url() {
  local project="$1"
  local service="$2"
  gcloud run services describe "$service" \
    --project="$project" \
    --region="$REGION" \
    --format='value(status.url)' 2>/dev/null || true
}

set_if_non_empty() {
  local file="$1"
  local key="$2"
  local value="$3"
  if [ -n "$value" ]; then
    upsert_env_value "$file" "$key" "$value"
  fi
}

set_secret_key() {
  local file="$1"
  local profile="$2"
  local project="$3"
  local key="$4"
  local required="$5"
  local value=""
  if value="$(get_secret_value "$project" "$key")"; then
    upsert_env_value "$file" "$key" "$value"
    return 0
  fi
  if [ "$required" = "true" ]; then
    MISSING_REQUIRED+=("${profile}: missing secret ${key} in ${project}")
  else
    WARNINGS+=("${profile}: optional secret ${key} missing in ${project}")
  fi
}

hydrate_backend_dev() {
  local file="$1"
  upsert_env_value "$file" "ENVIRONMENT" "development"
  set_if_non_empty "$file" "PORT" "$(read_env_value "$BACKEND_ACTIVE" "PORT")"
  set_if_non_empty "$file" "FRONTEND_URL" "$(read_env_value "$BACKEND_ACTIVE" "FRONTEND_URL")"
  set_if_non_empty "$file" "CORS_ALLOWED_ORIGINS" "$(read_env_value "$BACKEND_ACTIVE" "CORS_ALLOWED_ORIGINS")"
  set_if_non_empty "$file" "GOOGLE_GENAI_USE_VERTEXAI" "$(read_env_value "$BACKEND_ACTIVE" "GOOGLE_GENAI_USE_VERTEXAI")"
  set_if_non_empty "$file" "OTEL_ENABLED" "$(read_env_value "$BACKEND_ACTIVE" "OTEL_ENABLED")"

  for key in \
    SECRET_KEY VAULT_ENCRYPTION_KEY FIREBASE_SERVICE_ACCOUNT_JSON FIREBASE_AUTH_SERVICE_ACCOUNT_JSON \
    APP_REVIEW_MODE REVIEWER_UID MCP_DEVELOPER_TOKEN \
    DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD DB_UNIX_SOCKET \
    GOOGLE_API_KEY FINNHUB_API_KEY PMP_API_KEY \
    CONSENT_SSE_ENABLED SYNC_REMOTE_ENABLED DEVELOPER_API_ENABLED OBS_DATA_STALE_RATIO_THRESHOLD
  do
    set_if_non_empty "$file" "$key" "$(read_env_value "$BACKEND_ACTIVE" "$key")"
  done
}

hydrate_backend_cloud() {
  local file="$1"
  local profile="$2"
  local project="$3"
  local env_name="$4"

  upsert_env_value "$file" "ENVIRONMENT" "$env_name"

  local front_secret=""
  if front_secret="$(get_secret_value "$project" "FRONTEND_URL")"; then
    upsert_env_value "$file" "FRONTEND_URL" "$front_secret"
  else
    MISSING_REQUIRED+=("${profile}: missing secret FRONTEND_URL in ${project}")
  fi

  for key in PORT CORS_ALLOWED_ORIGINS GOOGLE_GENAI_USE_VERTEXAI OTEL_ENABLED DB_HOST DB_PORT DB_NAME DB_UNIX_SOCKET CONSENT_SSE_ENABLED SYNC_REMOTE_ENABLED DEVELOPER_API_ENABLED OBS_DATA_STALE_RATIO_THRESHOLD; do
    set_if_non_empty "$file" "$key" "$(run_env_value "$project" "$BACKEND_SERVICE" "$key")"
  done

  if [ -z "$(read_env_value "$file" "CORS_ALLOWED_ORIGINS")" ] && [ -n "$front_secret" ]; then
    upsert_env_value "$file" "CORS_ALLOWED_ORIGINS" "$front_secret"
  fi

  set_secret_key "$file" "$profile" "$project" "SECRET_KEY" "true"
  set_secret_key "$file" "$profile" "$project" "VAULT_ENCRYPTION_KEY" "true"
  set_secret_key "$file" "$profile" "$project" "GOOGLE_API_KEY" "true"
  set_secret_key "$file" "$profile" "$project" "FIREBASE_SERVICE_ACCOUNT_JSON" "true"
  set_secret_key "$file" "$profile" "$project" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON" "false"
  set_secret_key "$file" "$profile" "$project" "DB_USER" "true"
  set_secret_key "$file" "$profile" "$project" "DB_PASSWORD" "true"
  set_secret_key "$file" "$profile" "$project" "APP_REVIEW_MODE" "false"
  set_secret_key "$file" "$profile" "$project" "REVIEWER_UID" "false"
  set_secret_key "$file" "$profile" "$project" "MCP_DEVELOPER_TOKEN" "true"

  if [ -z "$(read_env_value "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON")" ]; then
    set_if_non_empty "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON" "$(read_env_value "$file" "FIREBASE_SERVICE_ACCOUNT_JSON")"
  fi
}

hydrate_frontend_dev() {
  local file="$1"
  upsert_env_value "$file" "NEXT_PUBLIC_APP_ENV" "development"
  set_if_non_empty "$file" "NEXT_PUBLIC_BACKEND_URL" "$(read_env_value "$FRONTEND_ACTIVE" "NEXT_PUBLIC_BACKEND_URL")"
  set_if_non_empty "$file" "NEXT_PUBLIC_APP_URL" "$(read_env_value "$FRONTEND_ACTIVE" "NEXT_PUBLIC_APP_URL")"
  set_if_non_empty "$file" "NEXT_PUBLIC_FRONTEND_URL" "$(read_env_value "$FRONTEND_ACTIVE" "NEXT_PUBLIC_FRONTEND_URL")"

  for key in \
    NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_VAPID_KEY \
    NEXT_PUBLIC_AUTH_FIREBASE_API_KEY NEXT_PUBLIC_AUTH_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_AUTH_FIREBASE_PROJECT_ID NEXT_PUBLIC_AUTH_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_UAT NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_STAGING NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_PRODUCTION \
    NEXT_PUBLIC_GTM_ID_UAT NEXT_PUBLIC_GTM_ID_STAGING NEXT_PUBLIC_GTM_ID_PRODUCTION \
    NEXT_PUBLIC_OBSERVABILITY_ENABLED NEXT_PUBLIC_OBSERVABILITY_DEBUG NEXT_PUBLIC_OBSERVABILITY_SAMPLE_RATE
  do
    set_if_non_empty "$file" "$key" "$(read_env_value "$FRONTEND_ACTIVE" "$key")"
  done

  # Next.js server routes in hushh-webapp verify Firebase ID tokens.
  # Keep these server-only values in frontend local profiles for parity with Cloud Run.
  set_if_non_empty "$file" "FIREBASE_SERVICE_ACCOUNT_JSON" "$(read_env_value "$FRONTEND_ACTIVE" "FIREBASE_SERVICE_ACCOUNT_JSON")"
  set_if_non_empty "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON" "$(read_env_value "$FRONTEND_ACTIVE" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON")"
  if [ -z "$(read_env_value "$file" "FIREBASE_SERVICE_ACCOUNT_JSON")" ]; then
    set_if_non_empty "$file" "FIREBASE_SERVICE_ACCOUNT_JSON" "$(read_env_value "$BACKEND_ACTIVE" "FIREBASE_SERVICE_ACCOUNT_JSON")"
  fi
  if [ -z "$(read_env_value "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON")" ]; then
    set_if_non_empty "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON" "$(read_env_value "$BACKEND_ACTIVE" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON")"
  fi
  if [ -z "$(read_env_value "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON")" ]; then
    set_if_non_empty "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON" "$(read_env_value "$file" "FIREBASE_SERVICE_ACCOUNT_JSON")"
  fi
}

hydrate_frontend_cloud() {
  local file="$1"
  local profile="$2"
  local project="$3"
  local env_name="$4"

  upsert_env_value "$file" "NEXT_PUBLIC_APP_ENV" "$env_name"

  local backend_url=""
  local frontend_url=""

  if backend_url="$(get_secret_value "$project" "BACKEND_URL")"; then
    upsert_env_value "$file" "NEXT_PUBLIC_BACKEND_URL" "$backend_url"
  else
    MISSING_REQUIRED+=("${profile}: missing secret BACKEND_URL in ${project}")
  fi

  if frontend_url="$(get_secret_value "$project" "FRONTEND_URL")"; then
    upsert_env_value "$file" "NEXT_PUBLIC_APP_URL" "$frontend_url"
    upsert_env_value "$file" "NEXT_PUBLIC_FRONTEND_URL" "$frontend_url"
  else
    local run_url
    run_url="$(run_service_url "$project" "$FRONTEND_SERVICE")"
    if [ -n "$run_url" ]; then
      upsert_env_value "$file" "NEXT_PUBLIC_APP_URL" "$run_url"
      upsert_env_value "$file" "NEXT_PUBLIC_FRONTEND_URL" "$run_url"
      WARNINGS+=("${profile}: FRONTEND_URL secret missing in ${project}; used Cloud Run URL")
    else
      MISSING_REQUIRED+=("${profile}: missing secret FRONTEND_URL in ${project}")
    fi
  fi

  for key in \
    NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_VAPID_KEY \
    NEXT_PUBLIC_AUTH_FIREBASE_API_KEY NEXT_PUBLIC_AUTH_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_AUTH_FIREBASE_PROJECT_ID NEXT_PUBLIC_AUTH_FIREBASE_APP_ID
  do
    set_secret_key "$file" "$profile" "$project" "$key" "true"
  done

  # Server-side token verification in frontend API routes.
  set_secret_key "$file" "$profile" "$project" "FIREBASE_SERVICE_ACCOUNT_JSON" "true"
  set_secret_key "$file" "$profile" "$project" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON" "false"
  if [ -z "$(read_env_value "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON")" ]; then
    set_if_non_empty "$file" "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON" "$(read_env_value "$file" "FIREBASE_SERVICE_ACCOUNT_JSON")"
  fi

  for key in \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_UAT NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_STAGING NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_PRODUCTION \
    NEXT_PUBLIC_GTM_ID_UAT NEXT_PUBLIC_GTM_ID_STAGING NEXT_PUBLIC_GTM_ID_PRODUCTION
  do
    set_secret_key "$file" "$profile" "$project" "$key" "false"
  done

  if [ -z "$(read_env_value "$file" "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_UAT")" ]; then
    set_if_non_empty "$file" "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_UAT" "$(read_env_value "$file" "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_STAGING")"
  fi
  if [ -z "$(read_env_value "$file" "NEXT_PUBLIC_GTM_ID_UAT")" ]; then
    set_if_non_empty "$file" "NEXT_PUBLIC_GTM_ID_UAT" "$(read_env_value "$file" "NEXT_PUBLIC_GTM_ID_STAGING")"
  fi
}

profiles=(dev uat prod)
for profile in "${profiles[@]}"; do
  copy_template_if_needed "$BACKEND_DIR/.env.${profile}.local.example" "$BACKEND_DIR/.env.${profile}.local"
  copy_template_if_needed "$FRONTEND_DIR/.env.${profile}.local.example" "$FRONTEND_DIR/.env.${profile}.local"
done

hydrate_backend_dev "$BACKEND_DIR/.env.dev.local"
hydrate_frontend_dev "$FRONTEND_DIR/.env.dev.local"
hydrate_backend_cloud "$BACKEND_DIR/.env.uat.local" "uat" "$UAT_PROJECT_ID" "uat"
hydrate_frontend_cloud "$FRONTEND_DIR/.env.uat.local" "uat" "$UAT_PROJECT_ID" "uat"
hydrate_backend_cloud "$BACKEND_DIR/.env.prod.local" "prod" "$PROD_PROJECT_ID" "production"
hydrate_frontend_cloud "$FRONTEND_DIR/.env.prod.local" "prod" "$PROD_PROJECT_ID" "production"

for profile in "${profiles[@]}"; do
  chmod 600 "$BACKEND_DIR/.env.${profile}.local" "$FRONTEND_DIR/.env.${profile}.local"
done

validate_canonical_keys() {
  local profile="$1"
  local backend_file="$2"
  local frontend_file="$3"
  local expected_backend="$4"
  local expected_frontend="$5"

  local backend_env
  backend_env="$(read_env_value "$backend_file" "ENVIRONMENT")"
  local frontend_env
  frontend_env="$(read_env_value "$frontend_file" "NEXT_PUBLIC_APP_ENV")"

  if [ -z "$backend_env" ]; then
    MISSING_REQUIRED+=("${profile}: missing ENVIRONMENT in ${backend_file#$REPO_ROOT/}")
  elif [ "$backend_env" != "$expected_backend" ]; then
    WARNINGS+=("${profile}: ENVIRONMENT expected ${expected_backend} but found ${backend_env}")
  fi

  if [ -z "$frontend_env" ]; then
    MISSING_REQUIRED+=("${profile}: missing NEXT_PUBLIC_APP_ENV in ${frontend_file#$REPO_ROOT/}")
  elif [ "$frontend_env" != "$expected_frontend" ]; then
    WARNINGS+=("${profile}: NEXT_PUBLIC_APP_ENV expected ${expected_frontend} but found ${frontend_env}")
  fi
}

validate_canonical_keys "dev" \
  "$BACKEND_DIR/.env.dev.local" \
  "$FRONTEND_DIR/.env.dev.local" \
  "development" \
  "development"

validate_canonical_keys "uat" \
  "$BACKEND_DIR/.env.uat.local" \
  "$FRONTEND_DIR/.env.uat.local" \
  "uat" \
  "uat"

validate_canonical_keys "prod" \
  "$BACKEND_DIR/.env.prod.local" \
  "$FRONTEND_DIR/.env.prod.local" \
  "production" \
  "production"

for path in \
  "$BACKEND_DIR/.env.dev.local" "$BACKEND_DIR/.env.uat.local" "$BACKEND_DIR/.env.prod.local" \
  "$FRONTEND_DIR/.env.dev.local" "$FRONTEND_DIR/.env.uat.local" "$FRONTEND_DIR/.env.prod.local"
do
  key_count="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$path" | wc -l | tr -d ' ')"
  SUMMARY+=("hydrated ${path#$REPO_ROOT/} (${key_count} keys)")
done

echo "Bootstrap profile summary:"
for item in "${SUMMARY[@]}"; do
  echo "- $item"
done

if [ "${#WARNINGS[@]}" -gt 0 ]; then
  echo ""
  echo "Warnings:"
  for warning in "${WARNINGS[@]}"; do
    echo "- $warning"
  done
fi

if [ "${#MISSING_REQUIRED[@]}" -gt 0 ]; then
  echo ""
  echo "Missing required values:"
  for missing in "${MISSING_REQUIRED[@]}"; do
    echo "- $missing"
  done
  if [ "$STRICT" = "true" ]; then
    exit 1
  fi
fi

echo ""
echo "Done. Use a profile with:"
echo "  bash scripts/env/use_profile.sh dev|uat|prod [--confirm-prod-local]"
