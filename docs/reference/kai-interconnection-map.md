# Kai Interconnection Map

Single source map for how Kai surfaces are connected across routes, service layer, cache, world model, providers, and mobile parity paths.

## Core Flows

### 1) Onboarding/Profile -> `kai_profile` Domain

| Step | Route/UI | Web Service Layer | Backend Route | Persistence | Cache / Sync |
| --- | --- | --- | --- | --- | --- |
| Persona/preferences capture | `/kai/onboarding`, `/profile` | `KaiProfileService`, `WorldModelService` | `/api/world-model/store-domain` | `world_model_data` + `world_model_index_v2.domain_summaries.kai_profile` | `CacheSyncService.onWorldModelDomainStored(...)` patches metadata and domain blob cache |
| Completion + nav tour state | onboarding components + nav tour | `KaiNavTourSyncService` / profile sync | `/api/world-model/store-domain` | encrypted `kai_profile` fields | cache write-through + metadata reconciliation |

Notes:
- `kai_profile` is the canonical encrypted source for onboarding state.
- Local pending/on-device flags are transitional and must reconcile after vault unlock.

### 2) Import -> `financial` Domain -> Dashboard/Home/Debate

| Step | Route/UI | Web Service Layer | Backend Route | Persistence | Cache / Sync |
| --- | --- | --- | --- | --- | --- |
| Statement upload/stream | `/kai/import` | `ApiService.streamPortfolioImport`, `kai-flow` | `/api/kai/portfolio/import/stream` | stream output only until commit | stage timeline + extracted holdings state in UI |
| Save validated holdings | portfolio review / save CTA | `WorldModelService.storeDomainData`, `CacheSyncService.onPortfolioUpserted` | `/api/world-model/store-domain` | encrypted `financial` domain + summary in index | `portfolio_data_*`, `world_model_metadata_*`, `domain_blob_*` write-through |
| Dashboard render | `/kai/dashboard` | `DashboardDataMapper`, `CacheService` | optional refresh via `/api/world-model/*` and market APIs | reads encrypted domain via vault key | cache-first with metadata/domain reconciliation |
| Debate context usage | `/kai/dashboard/analysis` + stream views | `ApiService.streamKaiAnalysis` | `/api/kai/analyze/stream` | decision persisted in `kai_decisions` path when stored | context derived from index summaries + optional decrypted domain fields |

### 3) Kai Home (`/kai`) -> Token Guard -> Market Cache -> Providers

| Step | Route/UI | Web Service Layer | Backend Route | Cache Layer | Provider Layer |
| --- | --- | --- | --- | --- | --- |
| Token resolution | `/kai` | `ensureKaiVaultOwnerToken` (`lib/services/kai-token-guard.ts`) | `/api/consent/vault-owner-token` (through web proxy) | in-memory token + expiry in vault context | N/A |
| Home fetch | `KaiMarketPreviewView` | `ApiService.getKaiMarketInsights` | `/api/kai/market/insights/{user_id}` | frontend memory/session cache (3 min), backend L1 memory + L2 postgres (`kai_market_cache_entries`) | Finnhub -> PMP/FMP -> fallbacks with cooldowns |
| Refresh behavior | manual refresh + poll | same as above | same as above | cache-first while fresh; stale fallback if provider errors | degraded labels and provider status emitted in payload |
| Startup/unlock warm | vault unlock flow + onboarding bridge | `UnlockWarmOrchestrator` (single-flight) | same endpoints as above | preloads world-model + consents + kai home caches | avoids duplicate warm calls across components |

### 4) Debate Stream -> Degraded Mode -> UI Decision Cards

| Step | Route/UI | Backend Stream | Contract | UI Surface |
| --- | --- | --- | --- | --- |
| Agent orchestration | analysis page / debate stream view | `/api/kai/analyze/stream` | canonical SSE envelope (`schema_version=1.0`) | round tabs + transcript |
| Partial failure handling | same | stream continues in degraded mode | terminal decision includes `analysis_degraded`, `degraded_agents` | short recommendation card + detailed decision card with degraded badges |
| Decision diagnostics | same | decision payload includes stream diagnostics | `stream_id`, `llm_calls_count`, `provider_calls_count`, `retry_counts`, `analysis_mode` | surfaced in typed decision models for observability |

## Dependency Links (Route -> Service -> Cache -> Data)

### `/kai/import`
- UI: `hushh-webapp/components/kai/kai-flow.tsx`
- API service: `hushh-webapp/lib/services/api-service.ts`
- Backend route: `consent-protocol/api/routes/kai/portfolio.py`
- World model persistence: `consent-protocol/hushh_mcp/services/world_model_service.py`
- Cache sync: `hushh-webapp/lib/cache/cache-sync-service.ts`

### `/kai`
- UI: `hushh-webapp/components/kai/views/kai-market-preview-view.tsx`
- Token guard: `hushh-webapp/lib/services/kai-token-guard.ts`
- Backend route: `consent-protocol/api/routes/kai/market_insights.py`
- Backend cache: `consent-protocol/hushh_mcp/services/market_insights_cache.py`
- Backend L2 cache: `consent-protocol/hushh_mcp/services/market_cache_store.py`

### `/kai/dashboard`
- UI: `hushh-webapp/components/kai/views/dashboard-master-view.tsx`
- Mapper: `hushh-webapp/components/kai/views/dashboard-data-mapper.ts`
- Domain consumption: `hushh-webapp/lib/utils/portfolio-normalize.ts`
- Source domain: encrypted `financial` + index summary

### `/kai/dashboard/analysis`
- UI stream consumer: `hushh-webapp/components/kai/debate-stream-view.tsx`
- Decision card: `hushh-webapp/components/kai/views/decision-card.tsx`
- Backend stream: `consent-protocol/api/routes/kai/stream.py`
- Debate engine: `consent-protocol/hushh_mcp/agents/kai/debate_engine.py`

## Blast Radius Matrix

| Change Surface | Immediate Impact | Downstream Risk | Required Validation |
| --- | --- | --- | --- |
| Route or payload schema change | API service parse and UI render paths | Silent undefined fields in cards/charts | `verify:routes`, stream contract checks, manual `/kai` + dashboard smoke |
| Cache key/TTL change | stale/fresh behavior in home/dashboard | hidden over-fetch or stale UI claims | `verify:cache`, `kai-system-audit.py`, cache logs |
| Unlock warm orchestration change | initial route readiness after vault unlock | duplicate warm calls, repeated `/db/vault/get`, delayed first paint | unlock-to-ready smoke + cache-hit logs |
| World-model summary change | context counters and dashboard hero values | false-zero context or missing counts | world-model audit script + debate context smoke |
| Provider fallback/cooldown change | market home and debate data completeness | rate-limit loops, noisy degraded states | provider status telemetry + `/kai` refresh behavior |
| Onboarding/chrome gating change | navbar/topbar/command bar visibility | onboarding regressions, broken tour sequencing | route-level smoke and mobile parity checklist |
| Streaming event contract change | debate/import progress rendering | terminal event loss or parser mismatch | canonical stream contract verification + UI stream smoke |

## Mobile/Plugin Parity Touchpoints

- Route parity guard: `hushh-webapp/scripts/verify-capacitor-routes.cjs`
- Plugin parity guard: `hushh-webapp/scripts/verify-native-parity.cjs`
- Canonical app routes: `hushh-webapp/lib/navigation/routes.ts`
- Kai runtime audit: `scripts/ops/kai-system-audit.py`

See also:
- `docs/reference/mobile-kai-parity-map.md`
- `docs/reference/kai-change-impact-matrix.md`
- `docs/reference/world-model-compatibility-playbook.md`
