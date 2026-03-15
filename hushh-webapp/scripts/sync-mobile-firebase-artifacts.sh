#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

IOS_TARGET="${IOS_TARGET:-${WEB_ROOT}/ios/App/App/GoogleService-Info.plist}"
ANDROID_TARGET="${ANDROID_TARGET:-${WEB_ROOT}/android/app/google-services.json}"
ENV_FILE="${ENV_FILE:-${WEB_ROOT}/.env.local}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
IOS_BUNDLE_ID="${IOS_BUNDLE_ID:-}"
ANDROID_PACKAGE_NAME="${ANDROID_PACKAGE_NAME:-}"
IOS_FIREBASE_APP_ID="${IOS_FIREBASE_APP_ID:-}"
ANDROID_FIREBASE_APP_ID="${ANDROID_FIREBASE_APP_ID:-}"
WRITE_B64_ENV_FILE="${WRITE_B64_ENV_FILE:-false}"
B64_ENV_OUTPUT="${B64_ENV_OUTPUT:-${WEB_ROOT}/.mobile-firebase-artifacts.env}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1"
    exit 1
  fi
}

log() {
  echo "[sync-mobile-firebase] $*"
}

read_env_key() {
  local key="$1"
  local file="$2"
  if [[ ! -f "${file}" ]]; then
    return
  fi
  local raw
  raw="$(grep -E "^${key}=" "${file}" | tail -n1 | cut -d= -f2- || true)"
  raw="${raw%\"}"
  raw="${raw#\"}"
  echo "${raw}"
}

require_cmd firebase
require_cmd jq
require_cmd python3

if [[ -z "${FIREBASE_PROJECT_ID}" ]]; then
  FIREBASE_PROJECT_ID="$(read_env_key NEXT_PUBLIC_FIREBASE_PROJECT_ID "${ENV_FILE}")"
fi
if [[ -z "${FIREBASE_PROJECT_ID}" ]]; then
  echo "ERROR: FIREBASE_PROJECT_ID is required (or set NEXT_PUBLIC_FIREBASE_PROJECT_ID in ${ENV_FILE})."
  exit 1
fi

if [[ -z "${IOS_BUNDLE_ID}" && -f "${IOS_TARGET}" ]]; then
  IOS_BUNDLE_ID="$(python3 - <<'PY' "${IOS_TARGET}"
import plistlib, sys
path = sys.argv[1]
try:
    with open(path, 'rb') as fh:
        data = plistlib.load(fh)
    print(str(data.get('BUNDLE_ID', '')).strip())
except Exception:
    print('')
PY
)"
fi

if [[ -z "${ANDROID_PACKAGE_NAME}" && -f "${ANDROID_TARGET}" ]]; then
  ANDROID_PACKAGE_NAME="$(jq -r '.client[0].client_info.android_client_info.package_name // empty' "${ANDROID_TARGET}" 2>/dev/null || true)"
fi

if [[ -z "${IOS_BUNDLE_ID}" ]]; then
  IOS_BUNDLE_ID="com.hushh.app"
fi
if [[ -z "${ANDROID_PACKAGE_NAME}" ]]; then
  ANDROID_PACKAGE_NAME="com.hushh.app"
fi

apps_json_raw="$(firebase apps:list --project "${FIREBASE_PROJECT_ID}" --json)"
apps_json="$(printf '%s\n' "${apps_json_raw}" | sed -n '/^{/,$p')"

if [[ -z "${IOS_FIREBASE_APP_ID}" ]]; then
  IOS_FIREBASE_APP_ID="$(printf '%s\n' "${apps_json}" | jq -r --arg ns "${IOS_BUNDLE_ID}" '.result[] | select(.platform=="IOS" and .namespace==$ns) | .appId' | head -n1)"
fi
if [[ -z "${ANDROID_FIREBASE_APP_ID}" ]]; then
  ANDROID_FIREBASE_APP_ID="$(printf '%s\n' "${apps_json}" | jq -r --arg ns "${ANDROID_PACKAGE_NAME}" '.result[] | select(.platform=="ANDROID" and .namespace==$ns) | .appId' | head -n1)"
fi

if [[ -z "${IOS_FIREBASE_APP_ID}" ]]; then
  echo "ERROR: Could not resolve iOS Firebase appId for bundle ${IOS_BUNDLE_ID}."
  exit 1
fi
if [[ -z "${ANDROID_FIREBASE_APP_ID}" ]]; then
  echo "ERROR: Could not resolve Android Firebase appId for package ${ANDROID_PACKAGE_NAME}."
  exit 1
fi

mkdir -p "$(dirname "${IOS_TARGET}")" "$(dirname "${ANDROID_TARGET}")"
tmp_ios="$(mktemp)"
tmp_android="$(mktemp)"
rm -f "${tmp_ios}" "${tmp_android}"
cleanup() {
  rm -f "${tmp_ios}" "${tmp_android}"
}
trap cleanup EXIT

log "Downloading iOS sdk config for appId=${IOS_FIREBASE_APP_ID}"
firebase apps:sdkconfig IOS "${IOS_FIREBASE_APP_ID}" --project "${FIREBASE_PROJECT_ID}" --out "${tmp_ios}" >/dev/null

log "Downloading Android sdk config for appId=${ANDROID_FIREBASE_APP_ID}"
firebase apps:sdkconfig ANDROID "${ANDROID_FIREBASE_APP_ID}" --project "${FIREBASE_PROJECT_ID}" --out "${tmp_android}" >/dev/null

mv "${tmp_ios}" "${IOS_TARGET}"
mv "${tmp_android}" "${ANDROID_TARGET}"

ios_analytics_enabled="$(python3 - <<'PY' "${IOS_TARGET}"
import plistlib, sys
with open(sys.argv[1], 'rb') as fh:
    data = plistlib.load(fh)
print('true' if bool(data.get('IS_ANALYTICS_ENABLED', False)) else 'false')
PY
)"
android_has_analytics_service="$(jq -r 'if any(.client[]?; .services.analytics_service? != null) then "true" else "false" end' "${ANDROID_TARGET}")"

log "Updated mobile Firebase artifacts:"
log "  iOS: ${IOS_TARGET}"
log "  Android: ${ANDROID_TARGET}"
log "  iOS IS_ANALYTICS_ENABLED=${ios_analytics_enabled}"
log "  Android analytics_service_present=${android_has_analytics_service}"

if [[ "${WRITE_B64_ENV_FILE}" == "true" ]]; then
  ios_b64="$(base64 < "${IOS_TARGET}" | tr -d '\n')"
  android_b64="$(base64 < "${ANDROID_TARGET}" | tr -d '\n')"
  cat > "${B64_ENV_OUTPUT}" <<EOF_ENV
IOS_GOOGLESERVICE_INFO_PLIST_B64=${ios_b64}
ANDROID_GOOGLE_SERVICES_JSON_B64=${android_b64}
EOF_ENV
  chmod 600 "${B64_ENV_OUTPUT}"
  log "Wrote base64 artifact env file: ${B64_ENV_OUTPUT}"
fi

if [[ "${ios_analytics_enabled}" != "true" || "${android_has_analytics_service}" != "true" ]]; then
  log "WARNING: Firebase app configs still indicate analytics is not fully enabled for native."
  log "         Link Firebase project/apps to GA4 and re-download artifacts."
fi
