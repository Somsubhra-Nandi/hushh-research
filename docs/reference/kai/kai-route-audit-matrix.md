# Kai Route Audit Matrix

Operational matrix for runtime audits without expanding automated test suites.

## Scope

| Route | Method | Expectation |
|---|---|---|
| `/kai/import` | `GET` | Import-first onboarding screen reachable |
| `/kai` | `GET` | Home route reachable (full/onboarding chrome by state) |
| `/kai/dashboard` | `GET` | Dashboard route reachable |
| `/kai/dashboard/analysis` | `GET` | Analysis route reachable |
| `/kai/dashboard/portfolio-health` | `GET` | Portfolio health route reachable |
| `/api/kai/portfolio/import/stream` | `POST` | Route exists; protected stream contract available |
| `/api/kai/portfolio/analyze-losers/stream` | `POST` | Route exists; protected stream contract available |
| `/api/kai/market/insights/{user_id}` | `GET` | Strict token gate, cache-backed v2 payload |
| `/api/kai/analyze/stream` | `GET` | Strict token gate, final decision guaranteed |
| `/api/kai/chat` | `POST` | Route exists and respects token/consent checks |
| `/api/tickers/search` | `GET` | Enriched ticker metadata available |
| `/api/tickers/all` | `GET` | Universe export available |

## Runtime Audit Command

```bash
python scripts/ops/kai-system-audit.py \
  --api-base http://localhost:8000 \
  --web-base http://localhost:3000
```

Optional world-model validation in same run:

```bash
python scripts/ops/kai-system-audit.py \
  --api-base http://localhost:8000 \
  --user-id <uid> \
  --passphrase '<passphrase>'
```

The script writes:
- `temp/kai-system-audit-<timestamp>.json`
- `temp/kai-system-audit-<timestamp>.md`

## Pass Criteria

1. OpenAPI route presence for all required paths/methods.
2. Runtime probes return non-terminal status (no unresolved route failures).
3. If world-model audit is supplied, audit script exits successfully.
4. Any degraded provider/module is explicitly labeled in API payload metadata.

## Feature Parity Audit Targets

In addition to route reachability, review these runtime behaviors:

1. Stream envelope consumption parity (import/optimize/analyze).
2. Token guard and one-refresh retry behavior for protected Kai routes.
3. Cache-first `/kai` refresh behavior within fresh TTL windows.
4. Onboarding chrome gating and command bar visibility during onboarding/import.
5. Bottom chrome scroll hide/reveal behavior on mobile-sized viewports.
