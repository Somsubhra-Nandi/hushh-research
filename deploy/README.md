# Hushh Research - Cloud Build Deployment

> **CI/CD deployment using Google Cloud Build**

---

## 🚀 Quick Deploy

### Backend Deployment

```bash
gcloud builds submit --config=deploy/backend.cloudbuild.yaml
```

### Frontend Deployment

```bash
gcloud builds submit --config=deploy/frontend.cloudbuild.yaml
```

---

## 🧭 Environment Profiles (Dev/UAT/Prod)

Use profile sources and activate one profile into the live local files:

- Backend active file: `consent-protocol/.env`
- Frontend active file: `hushh-webapp/.env.local`

Profile sources (local only, not committed):

- `consent-protocol/.env.dev.local`, `.env.uat.local`, `.env.prod.local`
- `hushh-webapp/.env.dev.local`, `.env.uat.local`, `.env.prod.local`

Activation:

```bash
bash scripts/env/use_profile.sh dev
bash scripts/env/use_profile.sh uat
bash scripts/env/use_profile.sh prod --confirm-prod-local
```

Makefile wrappers:

```bash
make env-use ENV=dev
make env-use ENV=uat
make env-use ENV=prod CONFIRM_PROD_LOCAL=1
make run-web ENV=uat
make run-backend ENV=dev
```

### Blocking vs optional validation

Blocking by default:

1. `scripts/ci/secret-scan.sh`
2. `scripts/ci/web-check.sh`
3. `scripts/ci/protocol-check.sh`
4. `scripts/ci/integration-check.sh`

Canonical executor:

- `scripts/ci/orchestrate.sh` (used by GitHub Actions stages and local wrappers)

Optional/advisory by default:

1. `scripts/ci/docs-parity-check.sh`
2. `scripts/ci/subtree-sync-check.sh`
3. `scripts/ops/verify-env-secrets-parity.py` (release/deploy preflight)
4. Native parity checks for native release lanes

Local full run with advisory checks:

```bash
INCLUDE_ADVISORY_CHECKS=1 ./scripts/test-ci-local.sh
```

### UAT analytics divergence note

`deploy_uat` currently includes newer analytics/auth-split expectations (`NEXT_PUBLIC_AUTH_FIREBASE_*`, measurement IDs, GTM IDs).  
Production analytics key migration is deferred intentionally and should be handled as a separate release task.

---

## 📋 Prerequisites

1. **Google Cloud SDK** installed and authenticated

   ```bash
   gcloud auth login
   gcloud config set project YOUR_GCP_PROJECT
   ```

2. **Enable Required APIs**

   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   ```

3. **Configure Secrets** (one-time setup)

   Secrets in GCP Secret Manager must match **exactly** what the code uses — no more, no less. See [docs/reference/operations/env-and-secrets.md](../docs/reference/operations/env-and-secrets.md) for the full audit and gcloud CLI.

   ```bash
   python3 scripts/ops/verify-env-secrets-parity.py \
     --project hushh-pda \
     --region us-central1 \
     --backend-service consent-protocol \
     --frontend-service hushh-webapp
   ```

   Required backend secrets (11):

   - `SECRET_KEY`
   - `VAULT_ENCRYPTION_KEY`
   - `GOOGLE_API_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FIREBASE_AUTH_SERVICE_ACCOUNT_JSON`
   - `FRONTEND_URL`
   - `DB_USER`
   - `DB_PASSWORD`
   - `APP_REVIEW_MODE`
   - `REVIEWER_UID`
   - `MCP_DEVELOPER_TOKEN`

   **Note:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `CONSENT_SSE_ENABLED`, and `SYNC_REMOTE_ENABLED` are set as Cloud Run env vars (not secrets). **Do not use `DATABASE_URL`** — migrations and scripts use DB_* only (strict parity). Delete `DATABASE_URL` from Secret Manager if present.

4. **Configure production logical backup infrastructure** (GCP)

   Provision the bucket + service accounts + Cloud Run Job + Cloud Scheduler:

   ```bash
   PROJECT_ID=hushh-pda REGION=us-central1 bash deploy/backup/setup_prod_logical_backup.sh
   ```

   The setup script enforces bucket hardening (UBLA + PAP), lifecycle delete at 14 days, and soft-delete disabled for cost control.

   If the currently deployed backend image does not yet include `scripts/ops/supabase_logical_backup.py`,
   pass an explicit image override:

   ```bash
   PROJECT_ID=hushh-pda REGION=us-central1 \
   BACKUP_JOB_IMAGE=gcr.io/hushh-pda/consent-protocol:backup-job-YYYYMMDD-HHMMSS \
   bash deploy/backup/setup_prod_logical_backup.sh
   ```

   Validate backup freshness policy locally (same gate used by production deploy workflow):

   ```bash
   python3 scripts/ops/logical_backup_freshness_check.py \
     --project-id hushh-pda \
     --bucket hushh-pda-prod-db-backups \
     --prefix prod/supabase-logical \
     --max-age-hours 30 \
     --report-path /tmp/prod-backup-posture-report.json
   ```

   This checker requires ADC-capable credentials (`gcloud auth application-default login`) or a service account credential source.

---

## 🔧 Cloud Build Configuration

### Backend (`backend.cloudbuild.yaml`)

Deploys Python FastAPI backend to Cloud Run:

- Builds Docker image from `consent-protocol/Dockerfile`
- Pushes to Google Container Registry
- Deploys to `consent-protocol` service
- Uses DB host/port env wiring (optionally supports Cloud SQL Unix socket when configured)
- Injects secrets from Secret Manager
- Sets `ENVIRONMENT=production` and `GOOGLE_GENAI_USE_VERTEXAI=True` (Vertex AI for Gemini)

### Frontend (`frontend.cloudbuild.yaml`)

Deploys Next.js frontend to Cloud Run:

- Builds Docker image from `hushh-webapp/Dockerfile`
- Bakes environment variables into static build
- Pushes to Google Container Registry
- Deploys to `hushh-webapp` service
- Serves via nginx

---

## 🔄 CI/CD Setup (GitHub/GitLab)

### GitHub Actions: Deploy workflows (production + UAT)

The repo includes:

- [.github/workflows/deploy-production.yml](../.github/workflows/deploy-production.yml): manual production deploy (`workflow_dispatch`).
- [.github/workflows/deploy-uat.yml](../.github/workflows/deploy-uat.yml): auto deploy on push to `deploy_uat` and manual dispatch.

Manual dispatch now supports `scope`:

- `all` (default): deploy backend then frontend in one run/approval
- `backend`: deploy backend only
- `frontend`: deploy frontend only

**For seamless deployment:**

1. **GitHub secret:** add `GCP_SA_KEY` (and optionally `GCP_SA_KEY_UAT`) with Cloud Build + Cloud Run + Secret Manager permissions.
2. **Branch flow:** merge to `deploy_uat` for UAT rollout; use manual dispatch for production rollout.
3. **Approval policy:** configure environment reviewers in GitHub Environments (`production`, `uat`) rather than repo code.

### CI Security Gates

- `.github/workflows/ci.yml` runs `gitleaks` as a mandatory secret-scanning gate.
- Native parity checks are optional in baseline CI and enabled for native release lanes.

### Option 1: Cloud Build Triggers (Recommended)

1. **Create Backend Trigger**

   ```bash
   gcloud builds triggers create github \
     --name=deploy-backend \
     --repo-name=hushh-research \
     --repo-owner=YOUR_ORG \
     --branch-pattern=^main$ \
     --build-config=deploy/backend.cloudbuild.yaml
   ```

2. **Create Frontend Trigger**
   ```bash
   gcloud builds triggers create github \
     --name=deploy-frontend \
     --repo-name=hushh-research \
     --repo-owner=YOUR_ORG \
     --branch-pattern=^main$ \
     --build-config=deploy/frontend.cloudbuild.yaml
   ```

### Option 2: Manual Deployment

```bash
# Deploy backend
gcloud builds submit --config=deploy/backend.cloudbuild.yaml

# Deploy frontend (uses BACKEND_URL secret)
gcloud builds submit --config=deploy/frontend.cloudbuild.yaml
```

---

## 🔐 Secrets Management

All required secrets must exist in Google Cloud Secret Manager before deployment. Run the parity audit script, then create any missing secrets manually.

**Backend (11 secrets):** `SECRET_KEY`, `VAULT_ENCRYPTION_KEY`, `GOOGLE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_AUTH_SERVICE_ACCOUNT_JSON`, `FRONTEND_URL`, `DB_USER`, `DB_PASSWORD`, `APP_REVIEW_MODE`, `REVIEWER_UID`, `MCP_DEVELOPER_TOKEN`

**Note:** 
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `CONSENT_SSE_ENABLED`, and `SYNC_REMOTE_ENABLED` are set as Cloud Run env vars (not secrets) in `backend.cloudbuild.yaml`
- Migrations use DB_* only (no DATABASE_URL). See docs/reference/operations/env-and-secrets.md.
- **Action required:** Create `DB_USER` and `DB_PASSWORD` secrets in Secret Manager if they don't exist:
  ```bash
  echo "your-db-username" | gcloud secrets create DB_USER --data-file=-
  echo "your-db-password" | gcloud secrets create DB_PASSWORD --data-file=-
  ```

**Frontend build-time (16 centrally-managed values):**
- `BACKEND_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (web push / FCM)
- `NEXT_PUBLIC_AUTH_FIREBASE_API_KEY`
- `NEXT_PUBLIC_AUTH_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_AUTH_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_AUTH_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_STAGING`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_PRODUCTION`
- `NEXT_PUBLIC_GTM_ID_STAGING`
- `NEXT_PUBLIC_GTM_ID_PRODUCTION`

These Firebase values are public client config, but are still centrally injected from Secret Manager to avoid hardcoded deploy YAML values.

**Frontend runtime (server-only Next.js API handlers):**
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_AUTH_SERVICE_ACCOUNT_JSON` (required for auth-split setups, e.g., UAT web using prod Firebase Auth)

See [docs/reference/operations/env-and-secrets.md](../docs/reference/operations/env-and-secrets.md) for full reference.

### Mobile Firebase Artifacts (Regulated)

- Do not commit production `GoogleService-Info.plist` or `google-services.json`.
- Store production mobile Firebase artifacts in Secret Manager:
  - `IOS_GOOGLESERVICE_INFO_PLIST_B64`
  - `ANDROID_GOOGLE_SERVICES_JSON_B64`
- Inject both during native release CI and overwrite template files before build/sign.
- Use `npm run inject:mobile-firebase` in `hushh-webapp/` after exporting those secrets into env vars.
- Or fetch latest artifacts directly from Firebase and write both files in place:
  ```bash
  cd hushh-webapp
  npm run sync:mobile-firebase
  ```
- Run `npm run verify:mobile-firebase` with `REQUIRE_PROD_FIREBASE_ARTIFACTS=true` in release jobs to fail fast if templates were not replaced.

### Observability Provisioning (Automated)

Use the idempotent setup script to provision observability infra in GCP:

```bash
bash deploy/observability/setup_gcp_observability.sh
```

Optional email notification channel wiring:

```bash
OBS_ALERT_EMAIL=you@example.com bash deploy/observability/setup_gcp_observability.sh
```

### Production DB Governance Helpers

```bash
# Provision logical backup infra (idempotent)
bash deploy/backup/setup_prod_logical_backup.sh

# Execute logical backup job manually (optional pre-deploy trigger)
gcloud run jobs execute prod-supabase-logical-backup \
  --project hushh-pda \
  --region us-central1 \
  --wait

# Read-only logical backup freshness gate
python3 scripts/ops/logical_backup_freshness_check.py \
  --project-id hushh-pda \
  --bucket hushh-pda-prod-db-backups \
  --prefix prod/supabase-logical \
  --max-age-hours 30 \
  --report-path /tmp/prod-backup-posture-report.json

# Read-only migration governance + DB drift checks
python3 scripts/ops/db_migration_release_guard.py \
  --report-path /tmp/db-migration-guard-report.json

# Generate audit manifest for a production release
python3 scripts/ops/generate_migration_release_manifest.py \
  --output /tmp/prod-migration-release-manifest.json \
  --environment production
```

### Verify Secrets

```bash
python3 scripts/ops/verify-env-secrets-parity.py \
  --project hushh-pda \
  --region us-central1 \
  --backend-service consent-protocol \
  --frontend-service hushh-webapp
```

### Create Secret

```bash
echo "your-secret-value" | gcloud secrets create SECRET_NAME --data-file=-
```

### Update Secret

```bash
echo "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

### View Secret

```bash
gcloud secrets versions access latest --secret=SECRET_NAME
```

---

## 🌐 Update CORS

After deploying frontend, update backend's CORS:

```bash
# Get frontend URL
FRONTEND_URL=$(gcloud run services describe hushh-webapp --region=us-central1 --format="value(status.url)")

# Update backend
gcloud run services update consent-protocol \
  --region=us-central1 \
  --update-env-vars=FRONTEND_URL=$FRONTEND_URL
```

---

## 🧪 Verification

### Backend

```bash
# Health check
curl https://consent-protocol-1006304528804.us-central1.run.app/health

# Swagger docs
open https://consent-protocol-1006304528804.us-central1.run.app/docs
```

### Frontend

```bash
# Get URL
gcloud run services describe hushh-webapp --region=us-central1 --format="value(status.url)"

# Health check
curl $(gcloud run services describe hushh-webapp --region=us-central1 --format="value(status.url)")/health
```

---

## 📊 Monitoring

### View Logs

```bash
# Backend
gcloud run services logs read consent-protocol --region=us-central1 --limit=50

# Frontend
gcloud run services logs read hushh-webapp --region=us-central1 --limit=50
```

### View Services

```bash
gcloud run services list --region=us-central1
```

---

## 🔄 Rollback

```bash
# List revisions
gcloud run revisions list --service=consent-protocol --region=us-central1

# Rollback
gcloud run services update-traffic consent-protocol \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

---

## 📁 File Structure

```
deploy/
├── backend.cloudbuild.yaml      # Backend Cloud Build config
├── frontend.cloudbuild.yaml     # Frontend Cloud Build config
├── backup/setup_prod_logical_backup.sh  # Logical backup infra bootstrap
├── ../scripts/ops/verify-env-secrets-parity.py  # Secrets/deploy parity audit utility
├── .env.backend.example         # Backend env vars template
├── .env.frontend.example        # Frontend env vars template
└── README.md                    # This file
```

---

## 🔧 Troubleshooting

### Build Fails

```bash
# View build logs
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```

### Service Not Accessible

```bash
# Check service status
gcloud run services describe SERVICE_NAME --region=us-central1

# Check logs
gcloud run services logs read SERVICE_NAME --region=us-central1 --limit=20
```

### CORS Errors

```bash
# Verify FRONTEND_URL is set
gcloud run services describe consent-protocol --region=us-central1 --format="value(spec.template.spec.containers[0].env)"
```

---

**Last Updated**: 2026-01-09
**Version**: 2.1 (Verified Cloud Build with yfinance fix)
