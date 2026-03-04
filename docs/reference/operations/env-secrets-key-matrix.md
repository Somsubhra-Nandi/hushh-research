# Env/Secrets Key Matrix

This matrix is the canonical key-level contract used by the pre-launch verification workflow.
It is intentionally key-only (no values) and is used to classify keys as `required`, `optional`, `legacy`, or runtime `drift`.

For live evidence across `.env`, `.env.local`, deploy manifests, Secret Manager, and Cloud Run:

```bash
bash scripts/verify-pre-launch.sh
```

## Contract Matrix

| key | read_by_code | backend_local_env | frontend_local_env | secret_manager | backend_cloudbuild | frontend_cloudbuild | cloud_run_live_backend | cloud_run_live_frontend | classification |
|---|---|---|---|---|---|---|---|---|---|
| `SECRET_KEY` | `consent-protocol/hushh_mcp/config.py` | Y | N | Y | secret | N | secret | N | required |
| `VAULT_ENCRYPTION_KEY` | `consent-protocol/hushh_mcp/config.py` | Y | N | Y | secret | N | secret | N | required |
| `GOOGLE_API_KEY` | `consent-protocol/hushh_mcp/config.py` | Y | N | Y | secret | N | secret | N | required |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `consent-protocol/api/utils/firebase_admin.py`, `hushh-webapp/lib/firebase/admin.ts` | Y | Y | Y | secret | N | secret | N | required |
| `FRONTEND_URL` | `consent-protocol/server.py` | Y | N | Y | secret | N | secret | N | required |
| `DB_USER` | `consent-protocol/db/connection.py` | Y | N | Y | secret | N | secret | N | required |
| `DB_PASSWORD` | `consent-protocol/db/connection.py` | Y | N | Y | secret | N | secret | N | required |
| `APP_REVIEW_MODE` | `consent-protocol/api/routes/health.py` | Y | N | Y | secret | N | secret | N | required |
| `REVIEWER_UID` | `consent-protocol/api/routes/health.py` | N | N | Y | secret | N | secret | N | required |
| `MCP_DEVELOPER_TOKEN` | `consent-protocol/api/routes/session.py` | Y | N | Y | secret | N | secret | N | required |
| `ENVIRONMENT` | `consent-protocol/hushh_mcp/config.py` | Y | N | N | env | N | env | N | required |
| `GOOGLE_GENAI_USE_VERTEXAI` | runtime SDK config | Y | N | N | env | N | env | N | required |
| `DB_HOST` | `consent-protocol/db/connection.py` | Y | N | N | env | N | env | N | required |
| `DB_PORT` | `consent-protocol/db/connection.py` | Y | N | N | env | N | env | N | required |
| `DB_NAME` | `consent-protocol/db/connection.py` | Y | N | N | env | N | env | N | required |
| `CONSENT_SSE_ENABLED` | `consent-protocol/api/routes/sse.py` | Y | N | N | env | N | env | N | required |
| `SYNC_REMOTE_ENABLED` | `runtime deploy env` | Y | N | N | env | N | env | N | required |
| `DEVELOPER_API_ENABLED` | `consent-protocol/server.py` | Y | N | N | env | N | env | N | required |
| `CORS_ALLOWED_ORIGINS` | `consent-protocol/server.py` | Y | N | N | env | N | env | N | required |
| `BACKEND_URL` | frontend server-side API handlers | N | N | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_BACKEND_URL` | `hushh-webapp/lib/config.ts` | N | Y | N | N | N | N | N | required |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `hushh-webapp/lib/firebase/config.ts` | N | Y | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `hushh-webapp/lib/firebase/config.ts` | N | Y | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `hushh-webapp/lib/firebase/config.ts` | N | Y | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `hushh-webapp/lib/firebase/config.ts` | N | Y | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `hushh-webapp/lib/firebase/config.ts` | N | Y | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `hushh-webapp/lib/firebase/config.ts` | N | Y | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | `hushh-webapp/lib/notifications/fcm-service.ts` | N | Y | Y | N | Y | N | N | required |
| `NEXT_PUBLIC_ENVIRONMENT_MODE` | `hushh-webapp/app/page.tsx` | N | Y | N | N | N | N | N | required |
| `REVIEWER_EMAIL` | none | N | N | N | N | N | N | N | legacy |
| `REVIEWER_PASSWORD` | none | N | N | N | N | N | N | N | legacy |
| `NEXT_PUBLIC_API_URL` | none | N | N | N | N | N | N | N | legacy |

## Notes

- `cloud_run_live_*` columns are evaluated from current active service revision at runtime by the audit script.
- `legacy` keys must not appear in Secret Manager, deploy manifests, or live Cloud Run env refs.
- `APP_REVIEW_MODE` is secret-managed in production and local `.env` fallback in development.
