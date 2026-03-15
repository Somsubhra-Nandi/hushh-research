# Cache Layer Report (Unlock Snapshot)

Generated from the latest unlock snapshot artifacts in this folder.

## 1) What is Frontend Cache?
Frontend cache is the in-app/browser memory cache managed by `CacheService` in `hushh-webapp/lib/services/cache-service.ts`.

For this user, frontend keys are:
- `world_model_blob_xm5IGgJtgGa1I6JlXRYWj5gliFz2`
- `world_model_metadata_xm5IGgJtgGa1I6JlXRYWj5gliFz2`
- `kai_market_home_xm5IGgJtgGa1I6JlXRYWj5gliFz2_IWF-IWD-IJH-IJR-GSINX-IEFA-IEMG-MTBIX_7`

Frontend cache artifact files:
- `temp/cache_unlock_payloads/world-model-unlock.json`
- `temp/cache_unlock_payloads/kai-market-unlock.json`

These two files are wrapper snapshots that include:
- the frontend cache key
- metadata about extraction
- the payload object stored under that key

## 2) What is Backend Cache / Backend Source?

### World model (backend source of truth)
There is no separate L1/L2 cache layer used in this snapshot flow for world-model payload retrieval.
Backend source tables are:
- `world_model_data` (encrypted blob)
- `world_model_index_v2` (queryable metadata summary)

Backend payload artifact file:
- `temp/cache_unlock_payloads/world-model-cache-payload.json`

### Kai market (backend cached endpoint)
Backend uses multi-tier caching in `consent-protocol/api/routes/kai/market_insights.py`:
- L1: process memory cache `market_insights_cache`
- L2: Postgres cache table `kai_market_cache_entries`
- L3: live provider fetch

Backend payload artifact file:
- `temp/cache_unlock_payloads/kai-market-cache-payload.json`

This payload includes cache diagnostics like:
- `meta.cache_tier`
- `meta.cache_hit`
- `cache_age_seconds`
- `stale`

## 3) File-to-Layer Mapping (Exact)

| File | Layer | Meaning |
|---|---|---|
| `temp/cache_unlock_payloads/world-model-unlock.json` | Frontend cache snapshot | What the app stores under `world_model_blob_*` and `world_model_metadata_*` at unlock |
| `temp/cache_unlock_payloads/kai-market-unlock.json` | Frontend cache snapshot | What the app stores under `kai_market_home_*` at unlock |
| `temp/cache_unlock_payloads/world-model-cache-payload.json` | Backend payload/source | Raw world-model payload after backend fetch/decrypt flow used for frontend warm |
| `temp/cache_unlock_payloads/kai-market-cache-payload.json` | Backend cached endpoint payload | Raw market-insights payload returned after backend L1/L2/live resolution |

## 4) Unlock Flow (Concise)
1. Vault unlock starts warm orchestration.
2. App fetches world model encrypted data + metadata, decrypts for use, then stores frontend keys `world_model_blob_*` and `world_model_metadata_*`.
3. App fetches `/api/kai/market/insights/{user_id}`.
4. Backend resolves market payload from L1/L2/live.
5. App stores response under `kai_market_home_*` frontend key.

