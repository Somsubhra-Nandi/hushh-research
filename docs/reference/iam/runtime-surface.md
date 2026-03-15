# Runtime Surface

## Purpose

Describe the current implemented Investor + RIA runtime surface (backend + web + MCP).

## Runtime Contract

| Variable | Layer | Role |
| --- | --- | --- |
| `ENVIRONMENT` | backend | Canonical runtime environment identity (`development`, `uat`, `production`) |
| `NEXT_PUBLIC_APP_ENV` | frontend | Canonical client environment identity (`development`, `uat`, `production`) |

Compatibility fallback (temporary): frontend still accepts `NEXT_PUBLIC_OBSERVABILITY_ENV` and `NEXT_PUBLIC_ENVIRONMENT_MODE` if `NEXT_PUBLIC_APP_ENV` is unset.

## IAM Schema Compatibility Mode

1. IAM activation is migration-gated, not startup-mutated.
2. Run explicit commands:
   `python db/migrate.py --iam`
   `python scripts/verify_iam_schema.py`
3. If IAM schema is missing:
4. `GET /api/iam/persona` returns `200` investor-safe payload with:
   `iam_schema_ready=false`, `mode="compat_investor"`.
5. `POST /api/iam/persona/switch` allows `investor` and returns `503 IAM_SCHEMA_NOT_READY` for `ria`.
6. `/api/ria/*` and `/api/marketplace/*` return `503` with code `IAM_SCHEMA_NOT_READY`.

## Route Families

1. Investor routes remain under existing `/kai/*`, `/consents`, `/profile`.
2. RIA routes:
   1. `/ria/onboarding`
   2. `/ria/clients`
   3. `/ria/workspace/[clientId]`
3. Compatibility aliases:
   1. `/ria/requests` -> `/consents?actor=ria&view=outgoing`
   2. `/ria/settings` -> `/profile?section=ria`
4. Marketplace route: `/marketplace`.

## Backend API Surface

### IAM

1. `GET /api/iam/persona`
2. `POST /api/iam/persona/switch`
3. `POST /api/iam/marketplace/opt-in`

### RIA

1. `POST /api/ria/onboarding/submit`
2. `GET /api/ria/onboarding/status`
3. `GET /api/ria/firms`
4. `GET /api/ria/clients`
5. `GET /api/ria/requests` (compatibility alias)
6. `POST /api/ria/requests` (compatibility alias)
7. `GET /api/ria/workspace/{investor_user_id}`
8. `GET /api/ria/invites`
9. `POST /api/ria/invites`

### Consent Center

1. `GET /api/consent/center`
2. `GET /api/consent/requests/outgoing`
3. `POST /api/consent/requests`

### Marketplace

1. `GET /api/marketplace/rias`
2. `GET /api/marketplace/investors`
3. `GET /api/marketplace/ria/{ria_id}`

## IAM Data Tables

1. `actor_profiles`
2. `ria_profiles`
3. `ria_firms`
4. `ria_firm_memberships`
5. `ria_verification_events`
6. `advisor_investor_relationships`
7. `ria_client_invites`
8. `consent_scope_templates`
9. `marketplace_public_profiles`
10. `runtime_persona_state` (transitional compatibility only)

## Persona State Ownership

1. `actor_profiles.last_active_persona` is the canonical persisted persona state.
2. `runtime_persona_state` is used only for transitional setup continuity before an account fully earns the `ria` persona.
3. Full-mode persona responses must prefer `actor_profiles` and never let runtime state override a real dual-persona account.

## Consent Integration

1. RIA request creation writes `REQUESTED` rows into `consent_audit` with actor metadata.
2. Consent approve/deny/cancel/revoke actions synchronize relationship lifecycle.
3. Workspace access is blocked unless relationship is approved and consent is active/non-expired.
4. Invite state is pre-consent workflow only; it is surfaced through the same consent-center read model but remains distinct from the canonical audit ledger.

## MCP Read-Only Tools

1. `list_ria_profiles`
2. `get_ria_profile`
3. `list_marketplace_investors`
4. `get_ria_verification_status`
5. `get_ria_client_access_summary`

These tools remain read-only in V1 and are gated by auth + consent + scope policy checks.
