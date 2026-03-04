# API Contracts

> Complete endpoint reference, authentication model, and developer integration guide.

---

## Token Hierarchy

All data access is gated by consent tokens. Firebase auth is only used to bootstrap the initial VAULT_OWNER token.

```
Firebase Sign-In
      │
      ▼
POST /api/consent/vault-owner-token  (Firebase Bearer)
      │
      ▼
  VAULT_OWNER Token (24h)
      │
      ├── All vault/data operations
      ├── Agent operations
      └── Can delegate scoped tokens to MCP agents (7d)
```

| Token Type            | Purpose                          | Duration | Auth Header Format              |
| --------------------- | -------------------------------- | -------- | ------------------------------- |
| Firebase ID Token     | Identity verification only       | 1 hour   | `Bearer <firebase-id-token>`   |
| VAULT_OWNER Token     | Consent + identity for all data  | 24 hours | `Bearer <vault-owner-token>`   |
| Agent Scoped Token    | Delegated MCP agent access       | 7 days   | `Bearer <consent-token>`       |
| Developer Token       | External API access              | N/A      | In request body                 |

---

## Route Categories

### Public (No Auth)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Detailed health check with agent list |
| GET | `/api/kai/health` | Kai subsystem health |
| GET | `/api/v1` | Developer API root (non-production only; `410` in production) |
| GET | `/api/v1/list-scopes` | List all available consent scopes (non-production only; `410` in production) |
| GET | `/api/v1/user-scopes/{user_id}` | Discover dynamic user scopes filtered by developer-approved scopes (requires developer token; non-production only; `410` in production) |
| GET | `/api/investors/search?q={name}` | Fuzzy search investors by name |
| GET | `/api/investors/{investor_id}` | Full investor profile by ID |
| GET | `/api/investors/cik/{cik}` | Investor profile by SEC CIK |
| GET | `/api/investors/stats` | Investor database statistics |
| GET | `/api/tickers/search?q={query}&limit={n}` | Public ticker search with enrichment metadata |
| GET | `/api/tickers/all` | Full ticker universe export with enrichment metadata |
| POST | `/api/validate-token` | Validate a consent token |
| GET | `/api/app-config/review-mode` | Review mode toggle (enabled only) |
| POST | `/api/app-config/review-mode/session` | Mint Firebase custom token for `REVIEWER_UID` when review mode enabled |

### Debug (Dev Only)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/debug/diagnostics` | Registered route diagnostics (returns `404` in production) |
| GET | `/debug/consent-listener` | Consent listener diagnostics (returns `404` in production) |
| GET | `/api/_debug/firebase` | Firebase debug endpoint (returns `404` in production) |

### Firebase Auth (Bootstrap)

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/consent/vault-owner-token` | Issue VAULT_OWNER token |
| POST | `/api/notifications/register` | Register FCM push token |
| DELETE | `/api/notifications/unregister` | Unregister FCM tokens (logout) |
| POST | `/api/kai/consent/grant` | Grant consent for Kai scopes |

### VAULT_OWNER (Consent-Gated)

#### Consent Management

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/consent/pending` | List pending consent requests |
| POST | `/api/consent/pending/approve` | Approve consent (zero-knowledge export) |
| POST | `/api/consent/pending/deny` | Deny consent request |
| POST | `/api/consent/cancel` | Cancel pending request |
| POST | `/api/consent/revoke` | Revoke active consent |
| GET | `/api/consent/history` | Paginated consent audit history |
| GET | `/api/consent/active` | Active (non-expired) tokens |

#### World Model

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/world-model/store-domain` | Store encrypted domain data + update index |
| GET | `/api/world-model/data/{user_id}` | Get full encrypted data blob |
| GET | `/api/world-model/domain-data/{user_id}/{domain}` | Get encrypted domain data |
| DELETE | `/api/world-model/domain-data/{user_id}/{domain}` | Delete a domain |
| GET | `/api/world-model/metadata/{user_id}` | Get world model metadata for UI |
| GET | `/api/world-model/scopes/{user_id}` | Get available scopes for user |
| POST | `/api/world-model/get-context` | Get user context for analysis |

#### Kai Chat

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/kai/chat` | Conversational Kai endpoint |
| GET | `/api/kai/chat/history/{conversation_id}` | Conversation history |
| GET | `/api/kai/chat/conversations/{user_id}` | List all conversations |
| GET | `/api/kai/chat/initial-state/{user_id}` | Initial chat state |
| POST | `/api/kai/chat/analyze-loser` | Analyze a specific loser |

#### Kai Portfolio

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/kai/portfolio/import` | Import brokerage statement (CSV/PDF) |
| POST | `/api/kai/portfolio/import/stream` | Streaming import with deterministic Gemini extraction, thought telemetry, and strict quality-gate aborts |
| GET | `/api/kai/portfolio/summary/{user_id}` | Portfolio summary from world model |
| GET | `/api/kai/dashboard/profile-picks/{user_id}` | Real profile-based picks for dashboard cards (`symbols`, `limit`) |
| POST | `/api/kai/portfolio/analyze-losers` | Analyze losers vs Renaissance |
| POST | `/api/kai/portfolio/analyze-losers/stream` | Streaming losers analysis (SSE, deterministic config, cash-excluded investable universe) |

#### Kai Analysis

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/kai/analyze` | 3-agent investment analysis |
| GET | `/api/kai/analyze/stream` | SSE streaming debate analysis |
| POST | `/api/kai/analyze/stream` | SSE streaming with context body |
| POST | `/api/analysis/analyze` | Deep fundamental analysis |

#### Kai Market Home

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/kai/market/insights/{user_id}` | Token-gated market home payload (cache-backed, provider-fallback aware) |

#### Kai Decisions

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/kai/decisions/{user_id}` | Decision history from domain summaries |

#### Kai Personalization

Kai personalization no longer uses dedicated `/api/kai/preferences/*` endpoints.
Optional intro fields are persisted in encrypted world-model path `financial.profile`.
Frontend reads/writes these fields through the centralized onboarding/profile flows that call world-model APIs.

#### Account & Sync

| Method | Path | Description |
| ------ | ---- | ----------- |
| DELETE | `/api/account/delete` | Delete user account and all data |

#### Vault Key Metadata (Setup/Get)

Vault setup/get now use a multi-wrapper `VaultState` contract:
- `vaultKeyHash`
- `primaryMethod`
- `recoveryEncryptedVaultKey`
- `recoverySalt`
- `recoveryIv`
- `wrappers[]` with:
  - `method`
  - `encryptedVaultKey`
  - `salt`
  - `iv`
  - `passkeyCredentialId` (nullable)
  - `passkeyPrfSalt` (nullable)

Method-management semantics:
- Passphrase wrapper is mandatory for every vault.
- Recovery wrapper is mandatory for every vault.
- Optional quick methods (native biometric/web PRF passkey) add wrappers for the same DEK.
- Primary method only controls default unlock UX; fallback wrappers remain valid.
- Additional endpoints: `POST /db/vault/wrapper/upsert`, `POST /db/vault/primary/set`.

Security invariant:
- No plaintext-at-rest path is allowed.
- World-model encryption/decryption always uses the same DEK regardless of unlock method.
| POST | `/api/sync/vault` | Disabled in regulated cutover (`501`, `SYNC_DISABLED`) |
| POST | `/api/sync/batch` | Disabled in regulated cutover (`501`, `SYNC_DISABLED`) |
| GET | `/api/sync/pull` | Disabled in regulated cutover (`501`, `SYNC_DISABLED`) |

### Consent Token (MCP Data Access)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/consent/data?token={consent_token}` | Retrieve encrypted export for token |

### SSE (Server-Sent Events)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/consent/events/{user_id}` | Disabled in production unless `CONSENT_SSE_ENABLED=true` |
| GET | `/api/consent/events/{user_id}/poll/{request_id}` | Deprecated and disabled (`410`, `CONSENT_POLL_DEPRECATED`) |

### Deprecated (410 Gone)

| Method | Path | Replacement |
| ------ | ---- | ----------- |
| POST | `/api/v1/food-data` | `GET /api/world-model/domain-data/{uid}/food` |
| POST | `/api/v1/professional-data` | `GET /api/world-model/domain-data/{uid}/professional` |
| DELETE | `/api/world-model/attributes/{uid}/{domain}/{key}` | Client-side BYOK operation |
| POST | `/api/kai/decision/store` | `POST /api/world-model/store-domain` with domain=`financial` |
| GET | `/api/kai/decision/{id}` | `GET /api/kai/decisions/{user_id}` |
| DELETE | `/api/kai/decision/{id}` | `POST /api/world-model/store-domain` with domain=`financial` |
| `*` | `/api/identity/*` | Removed from app surface; compatibility stubs return `410` |

---

## Kai Market Insights v2 Payload (Additive)

`GET /api/kai/market/insights/{user_id}` returns additive sections for `/kai`:

- `layout_version`
- `hero`
- `watchlist`
- `movers`
- `sector_rotation`
- `news_tape`
- `signals`
- `meta.symbol_quality`
- `meta.filtered_symbols`
- `meta.provider_status`

Backward-compatible sections remain present while migration is active:
- `market_overview`
- `spotlights`
- `themes`

### Ticker Enrichment Fields (`/api/tickers/search`, `/api/tickers/all`)

Each ticker row can include:

- `sic_code`
- `sic_description`
- `sector_primary`
- `industry_primary`
- `sector_tags`
- `metadata_confidence`
- `tradable`

### Analyze Stream Terminal Decision Metadata

Terminal `decision` events from `/api/kai/analyze/stream` include:

- `short_recommendation`
- `analysis_degraded`
- `degraded_agents`
- `company_strength_score` (0-10 deterministic score)
- `market_trend_label`
- `market_trend_score` (0-10 deterministic score)
- `fair_value_label`
- `fair_value_score` (0-10 deterministic score)
- `fair_value_gap_pct`
- `analysis_updated_at` (UTC ISO-8601)
- `stream_id`
- `llm_calls_count`
- `provider_calls_count`
- `retry_counts`
- `analysis_mode`

These fields are additive to the canonical decision payload and mirrored in `raw_card` where applicable.

### Portfolio Import Stream Terminal Diagnostics (V2)

Terminal payload from `POST /api/kai/portfolio/import/stream` now includes:

- `portfolio_data_v2` (canonical app-consumed portfolio payload)
- `raw_extract_v2` (raw single-pass LLM extraction snapshot)
- `analytics_v2` (materialized dashboard/debate/optimize metrics)
- `quality_report_v2` (deterministic quality report and gate output)
- `timings_ms` (phase timings, includes `total_ms`)
- `token_counts` (phase -> `{chunks, thoughts}`; import thoughts are suppressed for investor-facing output)
- `coverage_metrics` (positions availability coverage checks)
- `quality_gate`:
  - `passed`
  - `holdings_count`
  - `placeholder_symbol_count`
  - `account_header_row_count`
  - `core_keys_present`
  - `rows_with_symbol_pct`
  - `rows_with_market_value_pct`

If import cannot proceed, terminal events are:

- terminal `error` with `code=IMPORT_JSON_INVALID` (invalid/non-JSON extractor output)
- terminal `error` with `code=IMPORT_SCHEMA_INVALID` (missing required top-level keys)
- terminal `error` or `aborted` with `code=IMPORT_NO_HOLDINGS` (no confirmed holdings available)

No silent success is emitted on terminal failures.

---

## External Developer API

### Consent Flow

External developers (MCP agents, third-party apps) use the `/api/v1` endpoints:

```
1. POST /api/v1/request-consent
   Body: { user_id, scope, agent_id, developer_token, description }
   → Returns: { request_id, status: "pending" }

2. User receives FCM notification → approves in app

3. POST /api/validate-token
   Body: { token: "<consent-token>" }
   → Returns: { valid, user_id, scope, expires_at }

4. GET /api/consent/data?token=<consent-token>
   → Returns: { ciphertext, iv, tag, export_key }
   → Developer decrypts with export_key
```

Production policy:
- All `/api/v1/*` endpoints return `410` with:
- `{"error_code":"DEVELOPER_API_DISABLED_IN_PRODUCTION","message":"Developer API is disabled in production."}`
- Non-production can enable `/api/v1/*` via `DEVELOPER_API_ENABLED=true` with runtime registry `DEVELOPER_REGISTRY_JSON`.

### Available Scopes

```
world_model.read
world_model.write
attr.{domain}.*
attr.{domain}.{subintent}.*
attr.{domain}.{subintent}.{attribute}
```

Scope strings are dynamic. Do not hardcode domain keys. Discover user-available scopes via:

- `GET /api/world-model/scopes/{user_id}`
- `GET /api/v1/user-scopes/{user_id}` with `X-MCP-Developer-Token`
- `discover_user_domains(user_id)` in MCP

### Token Format

```
HCT:<base64(user_id|agent_id|scope|issued_at|expires_at)>.<hmac_sha256_signature>
```

### Error Responses

| Status | Meaning | Action |
| ------ | ------- | ------ |
| 401 | Missing or invalid token | Re-authenticate or re-request consent |
| 403 | Insufficient scope | Request additional scopes |
| 404 | Resource not found | Verify user_id or resource exists |
| 410 | Endpoint deprecated | Use the replacement endpoint |
| 429 | Rate limited | Back off and retry |

---

## Response Format

Backend returns **snake_case**. Frontend transforms to **camelCase** in the service layer.

```
Backend:  { "user_id": "abc", "domain_summaries": {...} }
Service:  { userId: "abc", domainSummaries: {...} }
React:    Uses camelCase throughout
```

Plugins requiring camelCase transformation: WorldModel, Kai.

---

## How to Add a New Endpoint

1. Create route function in `consent-protocol/api/routes/{module}.py`
2. Add auth dependency (`require_vault_owner_token` / `verify_firebase_bearer`)
3. Use service layer for all DB access (never direct SQL)
4. Register router in `server.py`: `app.include_router(router)`
5. Create Next.js proxy: `hushh-webapp/app/api/{path}/route.ts`
6. Create Capacitor plugin: iOS Swift + Android Kotlin
7. Add service method: `hushh-webapp/lib/services/{name}-service.ts`
8. Add route contract: `hushh-webapp/route-contracts.json`
9. Verify: `npm run verify:routes`

See [Architecture: Tri-Flow](./architecture.md#tri-flow-architecture) for the full pattern.

---

## See Also

- [Architecture](./architecture.md) -- System overview and tri-flow
- [World Model](../../../consent-protocol/docs/reference/world-model.md) -- Data storage endpoints
- [Consent Protocol](../../../consent-protocol/docs/reference/consent-protocol.md) -- Token lifecycle
