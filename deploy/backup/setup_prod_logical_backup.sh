#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
BACKEND_SERVICE="${BACKEND_SERVICE:-consent-protocol}"
BACKUP_BUCKET="${BACKUP_BUCKET:-hushh-pda-prod-db-backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-prod/supabase-logical}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
BACKUP_JOB_IMAGE="${BACKUP_JOB_IMAGE:-}"
BACKUP_JOB_NAME="${BACKUP_JOB_NAME:-prod-supabase-logical-backup}"
BACKUP_SCHEDULER_JOB_NAME="${BACKUP_SCHEDULER_JOB_NAME:-prod-supabase-logical-backup-daily}"
BACKUP_SCHEDULER_CRON="${BACKUP_SCHEDULER_CRON:-30 4 * * *}"
BACKUP_SCHEDULER_TIMEZONE="${BACKUP_SCHEDULER_TIMEZONE:-Etc/UTC}"
BACKUP_SA_NAME="${BACKUP_SA_NAME:-prod-db-backup-job}"
BACKUP_SCHEDULER_SA_NAME="${BACKUP_SCHEDULER_SA_NAME:-prod-db-backup-scheduler}"
SCHEDULER_LOCATION="${SCHEDULER_LOCATION:-${REGION}}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: PROJECT_ID is not set and no default gcloud project exists."
  exit 1
fi

BACKUP_SA_EMAIL="${BACKUP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BACKUP_SCHEDULER_SA_EMAIL="${BACKUP_SCHEDULER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $1"
    exit 1
  fi
}

log() {
  echo "[prod-backup-setup] $*"
}

require_cmd gcloud
require_cmd jq

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

ensure_apis() {
  log "Enabling required APIs"
  gcloud services enable \
    run.googleapis.com \
    cloudscheduler.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    secretmanager.googleapis.com \
    storage.googleapis.com \
    --project "${PROJECT_ID}" >/dev/null
}

ensure_bucket() {
  if gcloud storage buckets describe "gs://${BACKUP_BUCKET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    log "Backup bucket already exists: gs://${BACKUP_BUCKET}"
  else
    log "Creating backup bucket: gs://${BACKUP_BUCKET}"
    gcloud storage buckets create "gs://${BACKUP_BUCKET}" \
      --project "${PROJECT_ID}" \
      --location "${REGION}" >/dev/null
  fi

  log "Applying bucket hardening controls"
  gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
    --project "${PROJECT_ID}" \
    --uniform-bucket-level-access >/dev/null
  gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
    --project "${PROJECT_ID}" \
    --public-access-prevention >/dev/null

  cat > "${TMP_DIR}/lifecycle.json" <<EOF
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": ${BACKUP_RETENTION_DAYS} }
    }
  ]
}
EOF

  gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
    --project "${PROJECT_ID}" \
    --lifecycle-file "${TMP_DIR}/lifecycle.json" >/dev/null
  gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
    --project "${PROJECT_ID}" \
    --clear-soft-delete >/dev/null
}

ensure_service_accounts() {
  if gcloud iam service-accounts describe "${BACKUP_SA_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    log "Backup service account exists: ${BACKUP_SA_EMAIL}"
  else
    log "Creating backup service account: ${BACKUP_SA_EMAIL}"
    gcloud iam service-accounts create "${BACKUP_SA_NAME}" \
      --project "${PROJECT_ID}" \
      --display-name "Prod DB Logical Backup Job" >/dev/null
  fi

  if gcloud iam service-accounts describe "${BACKUP_SCHEDULER_SA_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    log "Scheduler service account exists: ${BACKUP_SCHEDULER_SA_EMAIL}"
  else
    log "Creating scheduler service account: ${BACKUP_SCHEDULER_SA_EMAIL}"
    gcloud iam service-accounts create "${BACKUP_SCHEDULER_SA_NAME}" \
      --project "${PROJECT_ID}" \
      --display-name "Prod DB Backup Scheduler Invoker" >/dev/null
  fi
}

bind_iam() {
  log "Granting storage.objectAdmin on backup bucket to ${BACKUP_SA_EMAIL}"
  gcloud storage buckets add-iam-policy-binding "gs://${BACKUP_BUCKET}" \
    --project "${PROJECT_ID}" \
    --member "serviceAccount:${BACKUP_SA_EMAIL}" \
    --role "roles/storage.objectAdmin" >/dev/null

  if gcloud secrets describe DB_USER --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding DB_USER \
      --project "${PROJECT_ID}" \
      --member "serviceAccount:${BACKUP_SA_EMAIL}" \
      --role "roles/secretmanager.secretAccessor" >/dev/null
  fi
  if gcloud secrets describe DB_PASSWORD --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding DB_PASSWORD \
      --project "${PROJECT_ID}" \
      --member "serviceAccount:${BACKUP_SA_EMAIL}" \
      --role "roles/secretmanager.secretAccessor" >/dev/null
  fi

  log "Granting run.developer to scheduler invoker SA"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${BACKUP_SCHEDULER_SA_EMAIL}" \
    --role "roles/run.developer" \
    --quiet >/dev/null

  local project_number
  project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
  local scheduler_agent="service-${project_number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
  log "Granting iam.serviceAccountTokenCreator to Cloud Scheduler service agent"
  gcloud iam service-accounts add-iam-policy-binding "${BACKUP_SCHEDULER_SA_EMAIL}" \
    --project "${PROJECT_ID}" \
    --member "serviceAccount:${scheduler_agent}" \
    --role "roles/iam.serviceAccountTokenCreator" \
    --quiet >/dev/null
}

set_backup_job() {
  local backend_json="${TMP_DIR}/backend.json"
  local existing_job_json="${TMP_DIR}/existing-backup-job.json"
  local job_exists="false"
  local existing_job_image=""

  if gcloud run jobs describe "${BACKUP_JOB_NAME}" --project "${PROJECT_ID}" --region "${REGION}" --format=json > "${existing_job_json}" 2>/dev/null; then
    job_exists="true"
    existing_job_image="$(jq -r '.spec.template.spec.template.spec.containers[0].image // empty' "${existing_job_json}")"
  fi

  gcloud run services describe "${BACKEND_SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format json > "${backend_json}"

  local image db_host db_port db_name cloudsql_instances db_unix_socket
  if [[ -n "${BACKUP_JOB_IMAGE}" ]]; then
    image="${BACKUP_JOB_IMAGE}"
    log "Using explicit backup job image override: ${image}"
  elif [[ -n "${existing_job_image}" ]]; then
    image="${existing_job_image}"
    log "Keeping existing backup job image: ${image}"
  else
    image="$(jq -r '.spec.template.spec.containers[0].image' "${backend_json}")"
    log "Using backend service image for initial backup job creation: ${image}"
  fi
  db_host="$(jq -r '.spec.template.spec.containers[0].env[] | select(.name=="DB_HOST") | .value' "${backend_json}" | head -n1)"
  db_port="$(jq -r '.spec.template.spec.containers[0].env[] | select(.name=="DB_PORT") | .value' "${backend_json}" | head -n1)"
  db_name="$(jq -r '.spec.template.spec.containers[0].env[] | select(.name=="DB_NAME") | .value' "${backend_json}" | head -n1)"
  db_unix_socket="$(jq -r '.spec.template.spec.containers[0].env[] | select(.name=="DB_UNIX_SOCKET") | .value' "${backend_json}" | head -n1)"
  cloudsql_instances="$(jq -r '.spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"] // empty' "${backend_json}")"

  if [[ -z "${image}" || -z "${db_host}" || -z "${db_port}" || -z "${db_name}" ]]; then
    echo "ERROR: failed to detect backend image or DB env from Cloud Run service ${BACKEND_SERVICE}"
    exit 1
  fi

  local env_vars
  env_vars="PROJECT_ID=${PROJECT_ID},ENVIRONMENT=production,DB_HOST=${db_host},DB_PORT=${db_port},DB_NAME=${db_name},BACKUP_BUCKET=${BACKUP_BUCKET},BACKUP_PREFIX=${BACKUP_PREFIX},BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS},BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS}"
  if [[ -n "${db_unix_socket}" && "${db_unix_socket}" != "null" ]]; then
    env_vars="${env_vars},DB_UNIX_SOCKET=${db_unix_socket}"
  fi

  local cloudsql_args=()
  if [[ -n "${cloudsql_instances}" ]]; then
    cloudsql_args=(--set-cloudsql-instances "${cloudsql_instances}")
  fi

  if [[ "${job_exists}" == "true" ]]; then
    log "Updating Cloud Run backup job: ${BACKUP_JOB_NAME}"
    gcloud run jobs update "${BACKUP_JOB_NAME}" \
      --project "${PROJECT_ID}" \
      --region "${REGION}" \
      --image "${image}" \
      --service-account "${BACKUP_SA_EMAIL}" \
      --tasks 1 \
      --parallelism 1 \
      --max-retries 0 \
      --task-timeout 3600s \
      --set-env-vars "${env_vars}" \
      --set-secrets "DB_USER=DB_USER:latest,DB_PASSWORD=DB_PASSWORD:latest" \
      "${cloudsql_args[@]}" \
      --command python \
      --args scripts/ops/supabase_logical_backup.py >/dev/null
  else
    log "Creating Cloud Run backup job: ${BACKUP_JOB_NAME}"
    gcloud run jobs create "${BACKUP_JOB_NAME}" \
      --project "${PROJECT_ID}" \
      --region "${REGION}" \
      --image "${image}" \
      --service-account "${BACKUP_SA_EMAIL}" \
      --tasks 1 \
      --parallelism 1 \
      --max-retries 0 \
      --task-timeout 3600s \
      --set-env-vars "${env_vars}" \
      --set-secrets "DB_USER=DB_USER:latest,DB_PASSWORD=DB_PASSWORD:latest" \
      "${cloudsql_args[@]}" \
      --command python \
      --args scripts/ops/supabase_logical_backup.py >/dev/null
  fi
}

set_scheduler() {
  local uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${BACKUP_JOB_NAME}:run"

  if gcloud scheduler jobs describe "${BACKUP_SCHEDULER_JOB_NAME}" --project "${PROJECT_ID}" --location "${SCHEDULER_LOCATION}" >/dev/null 2>&1; then
    log "Updating Cloud Scheduler job: ${BACKUP_SCHEDULER_JOB_NAME}"
    gcloud scheduler jobs update http "${BACKUP_SCHEDULER_JOB_NAME}" \
      --project "${PROJECT_ID}" \
      --location "${SCHEDULER_LOCATION}" \
      --schedule "${BACKUP_SCHEDULER_CRON}" \
      --time-zone "${BACKUP_SCHEDULER_TIMEZONE}" \
      --uri "${uri}" \
      --http-method POST \
      --oauth-service-account-email "${BACKUP_SCHEDULER_SA_EMAIL}" \
      --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform" \
      --message-body '{}' >/dev/null
  else
    log "Creating Cloud Scheduler job: ${BACKUP_SCHEDULER_JOB_NAME}"
    gcloud scheduler jobs create http "${BACKUP_SCHEDULER_JOB_NAME}" \
      --project "${PROJECT_ID}" \
      --location "${SCHEDULER_LOCATION}" \
      --schedule "${BACKUP_SCHEDULER_CRON}" \
      --time-zone "${BACKUP_SCHEDULER_TIMEZONE}" \
      --uri "${uri}" \
      --http-method POST \
      --oauth-service-account-email "${BACKUP_SCHEDULER_SA_EMAIL}" \
      --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform" \
      --message-body '{}' >/dev/null
  fi
}

main() {
  log "Starting logical backup setup in project=${PROJECT_ID}, region=${REGION}"
  ensure_apis
  ensure_bucket
  ensure_service_accounts
  bind_iam
  set_backup_job
  set_scheduler
  log "Setup complete."
  log "Bucket: gs://${BACKUP_BUCKET}"
  log "Cloud Run Job: ${BACKUP_JOB_NAME}"
  log "Cloud Scheduler: ${BACKUP_SCHEDULER_JOB_NAME} (${BACKUP_SCHEDULER_CRON} ${BACKUP_SCHEDULER_TIMEZONE})"
}

main "$@"
