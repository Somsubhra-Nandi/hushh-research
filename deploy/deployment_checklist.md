# Cloud Run Deployment Checklist

> **Quick reference for deploying Hushh to Google Cloud Run**

---

## Pre-Deployment

- [x] Google Cloud SDK installed and authenticated

  ```bash
  gcloud auth login
  gcloud config set project YOUR_GCP_PROJECT
  ```

- [x] Docker installed and running

  ```bash
  docker --version
  ```

- [x] Required GCP APIs enabled
  - Cloud Run API
  - Cloud Build API
  - Container Registry API
  - Secret Manager API
  - Cloud Scheduler API
  - Cloud Storage API

---

## Secrets Management

- [x] Verify existing secrets

  ```bash
  python3 scripts/ops/verify-env-secrets-parity.py \
    --project hushh-pda \
    --region us-central1 \
    --backend-service consent-protocol \
    --frontend-service hushh-webapp
  ```

- [x] Clean up obsolete secrets (if any)

  ```bash
  # Delete only keys reported as legacy by parity audit
  gcloud secrets delete <LEGACY_SECRET_NAME> --project hushh-pda
  ```

- [x] Create missing secrets

  ```bash
  gcloud secrets create <SECRET_NAME> --replication-policy=automatic --project hushh-pda
  echo -n '<value>' | gcloud secrets versions add <SECRET_NAME> --data-file=- --project hushh-pda
  ```

- [x] Verify all 10 required backend secrets exist:
  - [x] `SECRET_KEY`
  - [x] `VAULT_ENCRYPTION_KEY`
  - [x] `GOOGLE_API_KEY`
  - [x] `FIREBASE_SERVICE_ACCOUNT_JSON`
  - [x] `FRONTEND_URL`
  - [x] `DB_USER`
  - [x] `DB_PASSWORD`
  - [x] `APP_REVIEW_MODE`
  - [x] `REVIEWER_UID`
  - [x] `MCP_DEVELOPER_TOKEN`
  
  **Note:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `CONSENT_SSE_ENABLED`, `SYNC_REMOTE_ENABLED`, `DEVELOPER_API_ENABLED`, and `CORS_ALLOWED_ORIGINS` are Cloud Run env vars (not secrets). Do not use `DATABASE_URL`; migrations use DB_* only. Delete `DATABASE_URL` from Secret Manager for strict parity.

- [x] Ensure GitHub Actions has `GCP_SA_KEY` configured for prod workflows.

- [x] Provision/verify logical backup infrastructure (bucket + job + scheduler)

  ```bash
  PROJECT_ID=hushh-pda REGION=us-central1 bash deploy/backup/setup_prod_logical_backup.sh
  ```

- [x] Run pre-deploy logical backup freshness gate (read-only)

  ```bash
  python3 scripts/ops/logical_backup_freshness_check.py \
    --project-id hushh-pda \
    --bucket hushh-pda-prod-db-backups \
    --prefix prod/supabase-logical \
    --max-age-hours 30 \
    --report-path /tmp/prod-backup-posture-report.json
  ```

- [x] Run migration governance + DB drift gate

  ```bash
  python3 scripts/ops/db_migration_release_guard.py \
    --report-path /tmp/db-migration-guard-report.json
  ```

---

## Backend Deployment

- [x] Deploy backend

  ```powershell
  cd deploy
  .\deploy-backend.ps1
  ```

- [x] Verify backend health

  ```bash
  curl https://consent-protocol-1006304528804.us-central1.run.app/health
  ```

- [x] Test Swagger docs

  ```
  https://consent-protocol-1006304528804.us-central1.run.app/docs
  ```

- [x] Check Cloud SQL connection in logs
  ```bash
  gcloud run services logs read consent-protocol --region=us-central1 --limit=20
  ```

- [x] Backend env: Cloud Run sets `ENVIRONMENT=production` and `GOOGLE_GENAI_USE_VERTEXAI=True` (Vertex AI for Gemini)
- [x] Regulated defaults verified: `APP_REVIEW_MODE=false`, `DEVELOPER_API_ENABLED=false`, `CONSENT_SSE_ENABLED=false`, `SYNC_REMOTE_ENABLED=false`

---

## Frontend Deployment

- [x] Deploy frontend

  ```powershell
  cd deploy
  .\deploy-frontend.ps1
  ```

- [x] Note the frontend URL (output from deployment)

  ```
  Frontend URL: https://hushh-webapp-rpphvsc3tq-uc.a.run.app
  ```

- [x] Verify frontend health

  ```bash
  curl https://hushh-webapp-rpphvsc3tq-uc.a.run.app/health
  ```

- [x] Test frontend in browser
  ```
  https://hushh-webapp-rpphvsc3tq-uc.a.run.app
  ```

---

## CORS Configuration

- [x] Update backend CORS allowlist with frontend URL (`CORS_ALLOWED_ORIGINS`)

  ```powershell
  cd deploy
  .\update-cors.ps1 -FrontendUrl https://hushh-webapp-rpphvsc3tq-uc.a.run.app
  ```

- [x] Wait 30 seconds for deployment to complete

- [x] Verify CORS in backend logs
  ```bash
  gcloud run services logs read consent-protocol --region=us-central1 --limit=20 | Select-String "CORS"
  ```

---

## Integration Testing

- [x] **Login Flow**

  - Visit frontend URL
  - Click "Sign in with Google"
  - Verify Firebase authentication works
  - No errors in browser console

- [x] **Vault Creation**

  - Create vault with passphrase
  - Verify vault key is generated
  - Check backend logs for vault creation

- [x] **Agent Chat**

  - Chat with Food & Dining agent
  - Provide dietary preferences
  - Verify data is saved (check backend logs)
  - No CORS errors in browser console

- [x] **Data Persistence**

  - Logout
  - Login again
  - Verify data persists
  - Chat history is preserved

- [x] **CORS Verification**
  - Open browser DevTools Network tab
  - Perform agent chat request
  - Verify `Access-Control-Allow-Origin` header matches frontend URL
  - No CORS errors in console

---

## Monitoring

- [x] Set up log monitoring

  ```bash
  # Backend logs
  gcloud run services logs tail consent-protocol --region=us-central1

  # Frontend logs
  gcloud run services logs tail hushh-webapp --region=us-central1
  ```

- [x] Check Cloud Run metrics

  ```
  https://console.cloud.google.com/run?project=YOUR_GCP_PROJECT
  ```

- [x] Verify auto-scaling works
  - Send multiple concurrent requests
  - Check instance count in Cloud Run console

---

## Post-Deployment

- [x] Update documentation with actual URLs

- [x] Share URLs with team:

  - Backend: `https://consent-protocol-1006304528804.us-central1.run.app`
  - Frontend: `https://hushh-webapp-rpphvsc3tq-uc.a.run.app`
  - Swagger: `https://consent-protocol-1006304528804.us-central1.run.app/docs`

- [x] Set up monitoring alerts (optional)

- [x] Document any custom configuration changes

---

## Rollback Plan (If Needed)

- [ ] List revisions

  ```bash
  gcloud run revisions list --service=consent-protocol --region=us-central1
  ```

- [ ] Rollback backend

  ```bash
  gcloud run services update-traffic consent-protocol \
    --region=us-central1 \
    --to-revisions=PREVIOUS_REVISION=100
  ```

- [ ] Rollback frontend
  ```bash
  gcloud run services update-traffic hushh-webapp \
    --region=us-central1 \
    --to-revisions=PREVIOUS_REVISION=100
  ```

---

## Troubleshooting

If issues occur, check:

1. **Logs**: `gcloud run services logs read SERVICE_NAME --region=us-central1 --limit=50`
2. **Secrets**: `python3 scripts/ops/verify-env-secrets-parity.py --project hushh-pda --region us-central1 --backend-service consent-protocol --frontend-service hushh-webapp`
3. **CORS**: Browser DevTools Console
4. **Cloud SQL**: Backend logs for connection errors
5. **README.md**: Troubleshooting section

---

**Deployment Status**: ✅ Verified Healthy (2026-01-09)

**Last Updated**: 2026-01-09
