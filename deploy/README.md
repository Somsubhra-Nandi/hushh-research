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

   Required backend secrets (10):

   - `SECRET_KEY`
   - `VAULT_ENCRYPTION_KEY`
   - `GOOGLE_API_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FRONTEND_URL`
   - `DB_USER`
   - `DB_PASSWORD`
   - `APP_REVIEW_MODE`
   - `REVIEWER_UID`
   - `MCP_DEVELOPER_TOKEN`

   **Note:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `CONSENT_SSE_ENABLED`, and `SYNC_REMOTE_ENABLED` are set as Cloud Run env vars (not secrets). **Do not use `DATABASE_URL`** — migrations and scripts use DB_* only (strict parity). Delete `DATABASE_URL` from Secret Manager if present.

4. **Configure production backup governance secrets** (GitHub Actions)

   Add these repository secrets for production backup/PITR gates:

   - `SUPABASE_PROJECT_REF_PROD`
   - `SUPABASE_MANAGEMENT_TOKEN`

   Validate locally:

   ```bash
   python3 scripts/ops/supabase_backup_posture_check.py \
     --project-ref "$SUPABASE_PROJECT_REF_PROD" \
     --management-token "$SUPABASE_MANAGEMENT_TOKEN" \
     --require-pitr \
     --max-backup-age-hours 24
   ```

---

## 🔧 Cloud Build Configuration

### Backend (`backend.cloudbuild.yaml`)

Deploys Python FastAPI backend to Cloud Run:

- Builds Docker image from `consent-protocol/Dockerfile`
- Pushes to Google Container Registry
- Deploys to `consent-protocol` service
- Connects to Cloud SQL via Unix socket
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
- The same workflow validates that committed mobile Firebase artifacts are templates (`npm run verify:mobile-firebase`).

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

**Backend (10 secrets):** `SECRET_KEY`, `VAULT_ENCRYPTION_KEY`, `GOOGLE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FRONTEND_URL`, `DB_USER`, `DB_PASSWORD`, `APP_REVIEW_MODE`, `REVIEWER_UID`, `MCP_DEVELOPER_TOKEN`

**Note:** 
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `CONSENT_SSE_ENABLED`, and `SYNC_REMOTE_ENABLED` are set as Cloud Run env vars (not secrets) in `backend.cloudbuild.yaml`
- Migrations use DB_* only (no DATABASE_URL). See docs/reference/operations/env-and-secrets.md.
- **Action required:** Create `DB_USER` and `DB_PASSWORD` secrets in Secret Manager if they don't exist:
  ```bash
  echo "your-db-username" | gcloud secrets create DB_USER --data-file=-
  echo "your-db-password" | gcloud secrets create DB_PASSWORD --data-file=-
  ```

**Frontend build-time (12 centrally-managed values):**
- `BACKEND_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (web push / FCM)
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_STAGING`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_PRODUCTION`
- `NEXT_PUBLIC_GTM_ID_STAGING`
- `NEXT_PUBLIC_GTM_ID_PRODUCTION`

These Firebase values are public client config, but are still centrally injected from Secret Manager to avoid hardcoded deploy YAML values.

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
