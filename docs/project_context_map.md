# Project Context Map

> Orientation for contributors and coding agents. Read this before making changes.

## North Stars

- Hushh Principle: "An agent should work for the person whose life it touches."
- Kai North Star: "Your data, your business. Your committee, on-demand."

## CRITICAL RULES (Non-Negotiables)

These are invariants. If a change violates one, it is the wrong change.

1. **BYOK (Bring Your Own Key)**
   - Vault keys are derived/unlocked client-side.
   - The backend stores ciphertext only.
2. **Consent-First**
   - "Signed in" is not consent.
   - Every vault/world-model/agent operation requires a valid consent token with correct scope.
   - No backdoors or bypasses for dev/testing.
3. **Tri-Flow (Web + iOS + Android)**
   - Every data feature must work on Web, iOS, and Android (or be explicitly marked platform-specific).
   - Components do not call `fetch()`; they call the service layer (`hushh-webapp/lib/services/*`).
   - Keep route governance in sync (see `docs/reference/route_contracts.md`).
4. **Minimal Browser Storage**
   - Sensitive credentials and vault keys stay memory-only (React context / Zustand).
   - Only explicitly-approved non-sensitive cache/settings may use browser storage.

## Repo Map

- `hushh-webapp/`: Next.js + React + Capacitor shell (Web + iOS + Android)
  - UI: `hushh-webapp/app/`, `hushh-webapp/components/`
  - Platform-aware calls: `hushh-webapp/lib/services/`
  - Native bridges: `hushh-webapp/ios/App/App/Plugins/`, `hushh-webapp/android/app/src/main/java/.../plugins/`
- `consent-protocol/`: FastAPI backend + consent protocol + agents + MCP server (git subtree)
  - Routes: `consent-protocol/api/routes/`
  - Services (DB access): `consent-protocol/hushh_mcp/services/`
  - Agents/tools/operons: `consent-protocol/hushh_mcp/agents/`, `consent-protocol/hushh_mcp/operons/`, `consent-protocol/hushh_mcp/hushh_adk/`
- `docs/`: system reference, guides, vision, and audits (start at `docs/readme.md`)
- `deploy/`: Cloud Build/Cloud Run + App Store deployment docs
- `scripts/`: local CI and repo tooling

## Current Kai Route Map (v4.x)

The frontend route split is intentional and must remain stable unless route contracts are updated.

- `/`: public marketing onboarding surface (intro + preview, no auth controls)
- `/login`: auth-only surface (Google/Apple + disabled phone)
- `/kai/onboarding`: canonical onboarding questionnaire + persona
- `/kai/import`: portfolio connection/import flow and vault introduction moment
- `/kai`: signed-in info home (no vault required, first-time bottom-nav tour)
- `/kai/dashboard`: portfolio analytics/dashboard (requires data, redirects to `/kai/import` when empty)

Guard invariants:
- Incomplete onboarding cannot navigate to non-onboarding `/kai` routes.
- Vault unlock is required only when vault exists and protected operations need it.
- First-time no-vault users are not forced into vault unlock directly after login.

## Vault Security Model (Current)

- Encryption at rest is mandatory. There is no plaintext fallback.
- If custom passphrase is skipped, generated-default secure key mode is used.
- Single active KEK mode is authoritative:
  - `passphrase`
  - `generated_default_native_biometric`
  - `generated_default_web_prf`
- Method switching re-wraps the same vault key and updates metadata in `vault_keys`.
- Recovery key remains mandatory fallback.

## How Data Access Works (Mental Model)

- Web: React component -> service -> Next.js `/app/api/...` proxy -> FastAPI
- Native: React component -> service -> Capacitor plugin (Swift/Kotlin) -> FastAPI
- Backend: route -> service (validates consent) -> DB client -> Postgres (Supabase)

System overview: `docs/reference/architecture.md`

## Dynamic Domains & Scopes (World Model)

World-model storage is encrypted and domain-driven.

- Encrypted blobs: `world_model_data` (ciphertext)
- Non-encrypted index/metadata: `world_model_index_v2`
- Scope pattern: `attr.{domain}.{attribute_key}` (with wildcards like `attr.food.*`)

Primary references:
- `consent-protocol/docs/reference/world-model.md`
- `consent-protocol/docs/reference/consent-protocol.md`

Current onboarding/tour domain usage:
- `kai_profile` (encrypted) is canonical for onboarding completion and nav-tour completion/skips.
- Local pending stores are temporary per-user+device and sync after vault unlock.

Documentation work-in-progress is tracked in `consent-protocol/COMPLIANCE_PROGRESS.md`.

## When Adding A Feature

Use `docs/guides/new-feature.md` and treat it as a required checklist.

Minimum definition of done:
- Tri-flow implemented (or explicitly N/A) and tested on all platforms
- Consent token validated at entry points
- BYOK preserved (no plaintext-at-rest; if custom key is skipped, generate a secure default key)
- API documented (`docs/reference/api-contracts.md`)
- Route contracts updated (`hushh-webapp/route-contracts.json` + `cd hushh-webapp && npm run verify:routes`)
- Tests updated (`TESTING.md`)

## Trust/Compliance Reality Check

This repo includes a regulatory readiness audit:
- `docs/audits/2026-02-16-regulatory-readiness-audit.md`

If you're shipping anything investor-facing, read it and close critical findings first.
