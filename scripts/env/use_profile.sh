#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/env/use_profile.sh <dev|uat|prod> [--confirm-prod-local] [--dry-run]

Description:
  Activates local environment profile files by copying:
    consent-protocol/.env.<profile>.local  -> consent-protocol/.env
    hushh-webapp/.env.<profile>.local      -> hushh-webapp/.env.local

Notes:
  - Profile files are intentionally local-only and should not be committed.
  - Production profile activation requires --confirm-prod-local.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ "$#" -lt 1 ]; then
  usage
  exit 0
fi

PROFILE="${1:-}"
shift || true

CONFIRM_PROD_LOCAL=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --confirm-prod-local)
      CONFIRM_PROD_LOCAL=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

case "$PROFILE" in
  dev)
    BACKEND_ENVIRONMENT="development"
    FRONTEND_APP_ENV="development"
    GCP_PROJECT_ID="(none-local)"
    ;;
  uat)
    BACKEND_ENVIRONMENT="uat"
    FRONTEND_APP_ENV="uat"
    GCP_PROJECT_ID="hushh-pda-uat"
    ;;
  prod)
    BACKEND_ENVIRONMENT="production"
    FRONTEND_APP_ENV="production"
    GCP_PROJECT_ID="hushh-pda"
    if [ "$CONFIRM_PROD_LOCAL" != "true" ]; then
      echo "Refusing to activate prod profile without --confirm-prod-local." >&2
      exit 1
    fi
    ;;
  *)
    echo "Invalid profile: $PROFILE (expected dev|uat|prod)" >&2
    exit 1
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
BACKEND_SOURCE="$REPO_ROOT/consent-protocol/.env.${PROFILE}.local"
FRONTEND_SOURCE="$REPO_ROOT/hushh-webapp/.env.${PROFILE}.local"
BACKEND_TARGET="$REPO_ROOT/consent-protocol/.env"
FRONTEND_TARGET="$REPO_ROOT/hushh-webapp/.env.local"

if [ ! -f "$BACKEND_SOURCE" ]; then
  echo "Missing backend profile file: $BACKEND_SOURCE" >&2
  echo "Create it from: ${BACKEND_SOURCE}.example" >&2
  exit 1
fi

if [ ! -f "$FRONTEND_SOURCE" ]; then
  echo "Missing frontend profile file: $FRONTEND_SOURCE" >&2
  echo "Create it from: ${FRONTEND_SOURCE}.example" >&2
  exit 1
fi

if [ "$DRY_RUN" != "true" ]; then
  cp "$BACKEND_SOURCE" "$BACKEND_TARGET"
  cp "$FRONTEND_SOURCE" "$FRONTEND_TARGET"
fi

echo "Activated profile: $PROFILE"
echo "Backend ENVIRONMENT target: $BACKEND_ENVIRONMENT"
echo "Frontend NEXT_PUBLIC_APP_ENV target: $FRONTEND_APP_ENV"
echo "Expected GCP project: $GCP_PROJECT_ID"
echo "Backend source: $BACKEND_SOURCE"
echo "Frontend source: $FRONTEND_SOURCE"
if [ "$DRY_RUN" = "true" ]; then
  echo "Dry run: no files were copied."
fi
