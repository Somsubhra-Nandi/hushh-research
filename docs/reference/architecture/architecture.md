# Architecture

> Current runtime architecture for the Hushh monorepo.

---

## System Shape

```text
Web / iOS / Android clients
  -> Next.js route handlers or Capacitor plugins
  -> FastAPI backend
  -> service layer
  -> PostgreSQL / external services
```

Core invariants:

1. BYOK: user-private payloads stay encrypted client-side.
2. Consent-first: data access is token-gated and audited.
3. Tri-flow: web, iOS, and Android stay contract-aligned.
4. Canonical private data plane: world-model data remains the user-private storage boundary.

---

## Backend: `consent-protocol/`

Runtime: Python 3.13, FastAPI, Uvicorn, Cloud Run.

### Registered Router Surface

All live routers are registered in `consent-protocol/server.py`.

| Router Module | Prefix | Purpose |
| --- | --- | --- |
| `health` | `/`, `/health`, `/kai/health`, app-config health helpers | liveness, readiness, app-review config |
| `agents` | `/api/agents` | agent discovery and related agent endpoints |
| `consent` | `/api/consent` | consent requests, grants, revocation, history |
| `session` | `/api` | session and lookup helpers used by app/auth flows |
| `developer` | `/api/v1` | developer API surface |
| `db_proxy` | `/db` | database proxy endpoints used by specific native flows |
| `sse` | `/api/consent/events` and related SSE endpoints | realtime consent events |
| `notifications` | `/api/notifications` | push token registration and notification support |
| `kai` | `/api/kai` | Kai chat, analysis, portfolio, streaming, decisions |
| `investors` | `/api/investors` | investor discovery/profile surface |
| `tickers` | `/api/tickers` | ticker search and holdings sync helpers |
| `identity` | compatibility identity endpoints | compatibility shims for identity flows |
| `world_model` | `/api/world-model` | store-domain, data, domain-data, metadata, scopes, context |
| `account` | `/api/account` | account deletion and management |
| `iam` | `/api/iam` | IAM actor and policy surface |
| `ria` | `/api/ria` | advisor onboarding and workspace flows |
| `marketplace` | `/api/marketplace` | marketplace discovery and publishing |
| `invites` | `/api/invites` | invite issuance and redemption |
| `debug_firebase` | `/api/_debug/*` in non-production only | local/debug-only auth diagnostics |

Not currently registered:

- no live `/api/sync` router
- no `api/routes/kai/preferences.py` module

### World-Model Runtime Surface

The backend router is the authoritative world-model contract. Current supported path families include:

- `POST /api/world-model/store-domain`
- `GET /api/world-model/data/{user_id}`
- `GET|DELETE /api/world-model/domain-data/{user_id}/{domain}`
- `POST /api/world-model/reconcile/{user_id}`
- `DELETE /api/world-model/attributes/{user_id}/{domain}/{attribute_key}` returning legacy-removal behavior
- `GET /api/world-model/metadata/{user_id}`
- `GET /api/world-model/domain-registry`
- `GET /api/world-model/scopes/{user_id}`
- `POST /api/world-model/get-context`

Removed legacy read surfaces such as `/index`, `/attributes`, `/domains`, `/portfolio`, and `/portfolios` are not part of the supported contract.

### Service Layer

Routes do not access the database directly. Database access flows through service classes.

```text
FastAPI route -> service -> DatabaseClient / external adapter -> PostgreSQL or remote API
```

Representative services:

- `WorldModelService`
- `ConsentDBService`
- `ChatDBService`
- `UniverseListService`
- `RenaissanceService`
- `PushTokensService`
- `DomainRegistryService`

### Backend Directory Layout

```text
consent-protocol/
  server.py
  consent_db.py
  api/
    middlewares/
    routes/
      account.py
      agents.py
      consent.py
      db_proxy.py
      debug_firebase.py
      developer.py
      health.py
      iam.py
      identity.py
      investors.py
      invites.py
      marketplace.py
      notifications.py
      ria.py
      session.py
      sse.py
      tickers.py
      world_model.py
      kai/
        __init__.py
        analyze.py
        chat.py
        consent.py
        decisions.py
        health.py
        market_insights.py
        plaid.py
        portfolio.py
        stream.py
  hushh_mcp/
    agents/
    consent/
    hushh_adk/
    integrations/
      plaid/
    operons/
      kai/
        brokerage.py
    services/
  db/
    migrations/
  mcp_modules/
  docs/
```

---

## Frontend: `hushh-webapp/`

Runtime: Next.js 16 App Router, React 19, Tailwind CSS, Capacitor 8.

### App Route Contract

Current app-level navigation targets are defined in `hushh-webapp/lib/navigation/routes.ts`:

- `/`
- `/login`
- `/logout`
- `/labs/profile-appearance`
- `/profile`
- `/consents`
- `/marketplace`
- `/marketplace/ria`
- `/ria`
- `/ria/onboarding`
- `/ria/clients`
- `/ria/requests`
- `/ria/settings`
- `/kai`
- `/kai/onboarding`
- `/kai/import`
- `/kai/plaid/oauth/return`
- `/kai/portfolio`
- `/kai/analysis`
- `/kai/optimize`

Additional implemented route families outside the constant map include:

- `/marketplace/ria/[riaId]`
- `/ria/workspace/[clientId]`

### Tri-Flow Delivery

Product features that cross the backend boundary are expected to preserve parity across:

- web: Next.js route handlers under `app/api/**`
- iOS: Swift Capacitor plugins
- Android: Kotlin Capacitor plugins

```text
Component -> service layer -> web route handler or native plugin -> backend
```

Components should not own backend fetch orchestration directly.

### Frontend Directory Layout

```text
hushh-webapp/
  app/
    api/
    consents/
    kai/
      analysis/
      dashboard/
      import/
      onboarding/
      optimize/
    labs/
      profile-appearance/
    login/
    logout/
    marketplace/
      ria/
        [riaId]/
    profile/
    ria/
      clients/
      onboarding/
      requests/
      settings/
      workspace/
        [clientId]/
  components/
  ios/App/App/Plugins/
  android/app/src/main/java/.../plugins/
  lib/
    agents/
    api/
    auth/
    capacitor/
    consent/
    firebase/
    kai/
      brokerage/
    navigation/
    notifications/
    observability/
    services/
    stores/
    streaming/
    vault/
  docs/
```

---

## Data Boundary

Runtime data is split into:

- relational operational state in PostgreSQL
- encrypted user-private payloads in the world-model data plane
- public/shared marketplace, IAM, and system-curated datasets in relational tables

The world-model boundary is the only supported private data plane for investor and RIA user-owned content.

---

## Operational References

- API contract detail: [api-contracts.md](./api-contracts.md)
- route governance: [route-contracts.md](./route-contracts.md)
- DB/runtime fact sheet: [runtime-db-fact-sheet.md](./runtime-db-fact-sheet.md)
- env and secrets contract: [../operations/env-and-secrets.md](../operations/env-and-secrets.md)
- backend world-model reference: [../../../consent-protocol/docs/reference/world-model.md](../../../consent-protocol/docs/reference/world-model.md)
- backend consent reference: [../../../consent-protocol/docs/reference/consent-protocol.md](../../../consent-protocol/docs/reference/consent-protocol.md)
