# Hushh Master Engineering Specification

Temporary current-state rewrite aligned to the repository as of March 13, 2026.

This file is a working correction of `temp/Hushh-Master-Engineering-Specification-v1_0.pdf`. It is intentionally grounded in implemented code and canonical repo docs, not in generalized platform language from the PDF. The source of truth remains the codebase plus the canonical documents under `docs/`, `hushh-webapp/docs/`, and `consent-protocol/docs/`.

## 1. Source Precedence

Use these in order when making engineering decisions:

1. Implemented code paths in `hushh-webapp/` and `consent-protocol/`
2. Canonical docs such as:
   - `docs/project_context_map.md`
   - `docs/reference/architecture/architecture.md`
   - `docs/reference/architecture/api-contracts.md`
   - `docs/reference/architecture/route-contracts.md`
   - `docs/reference/iam/architecture.md`
   - `docs/reference/iam/runtime-surface.md`
   - `docs/reference/kai/kai-interconnection-map.md`
3. Vision and future-plan docs only for explicitly marked future-state sections

## 2. Current System Overview

Hushh currently runs as a consent-first, BYOK personal-agent platform with Kai as the primary shipped product surface and Investor/RIA IAM as an active expansion area.

Current runtime stack:

- Client: Next.js 16, React 19, Tailwind CSS, Capacitor 8
- Backend: FastAPI on Python 3.13
- Storage: Supabase/Postgres
- Agent runtime: Google ADK-based Kai architecture in the backend
- Auth bootstrap: Firebase Auth
- Core security model: BYOK, consent-first, tri-flow, minimal browser storage

The repo does not currently implement a Salesforce CRM object model, MuleSoft runtime governance plane, or Agentforce-hosted production architecture as repository truth.

## 3. Non-Negotiable Engineering Invariants

These are the repo-level rules that override generalized planning language:

1. BYOK
   - Vault keys are derived and unlocked client-side.
   - The backend stores ciphertext only.
2. Consent-first
   - Being signed in is not enough.
   - Every vault, world-model, and agent data operation requires a valid consent token with the correct scope.
3. Tri-flow
   - Features must stay aligned across web, iOS, and Android unless explicitly platform-specific.
   - Components do not call `fetch()` directly for product data; they go through the service layer.
4. Minimal browser storage
   - Sensitive credentials and vault keys remain memory-only.
   - Only approved non-sensitive cache/settings may persist locally.

## 4. Runtime Architecture

### 4.1 Client Layer

The active client runtime lives in `hushh-webapp/`.

- Web app: Next.js App Router
- Native shells: Capacitor-backed iOS and Android wrappers
- State: memory-first flows using React context and Zustand
- Design system: Morphy UX + shadcn/ui + Lucide wrapper conventions
- Route governance: `hushh-webapp/route-contracts.json`

Current route families include:

- Public/auth: `/`, `/login`, `/logout`
- Investor/Kai: `/kai/onboarding`, `/kai/import`, `/kai`, `/kai/dashboard`, `/kai/analysis`, `/kai/optimize`
- Shared: `/marketplace`, `/consents`, `/profile`
- RIA: `/ria`, `/ria/onboarding`, `/ria/clients`, `/ria/requests`, `/ria/settings`, `/ria/workspace/[clientId]`

### 4.2 Tri-Flow Data Path

The canonical mental model is:

`Component -> Service -> [Web: Next.js proxy | Native: Capacitor plugin] -> FastAPI -> Service layer -> Postgres`

Implications:

- Web routes under `hushh-webapp/app/api/**` proxy to backend routes
- Native runtime uses TypeScript plugin contracts plus Swift/Kotlin plugin implementations
- Route parity is enforced by `npm run verify:routes` and native parity scripts

### 4.3 Backend Layer

The active backend runtime lives in `consent-protocol/`.

- FastAPI route modules are under `api/routes/`
- Database access is mediated through service classes under `hushh_mcp/services/`
- Kai agent logic uses the Hushh-wrapped Google ADK stack under `hushh_mcp/agents/`, `hushh_mcp/operons/`, and `hushh_mcp/hushh_adk/`
- MCP tooling exists in the backend repository, but it is part of the consent-gated backend ecosystem, not evidence of a fully generalized external enterprise connector fabric already shipped everywhere

## 5. Security, Consent, and Data Model

### 5.1 Token Hierarchy

The implemented token flow is:

1. Firebase sign-in establishes identity
2. `POST /api/consent/vault-owner-token` issues a VAULT_OWNER token
3. VAULT_OWNER tokens gate vault and private-data operations
4. Scoped agent or consent tokens are used for narrower delegated access paths

Current repo defaults:

- Firebase ID token: bootstrap identity only
- VAULT_OWNER token: primary data-access token, typically 24 hours
- Agent scoped token: delegated and narrower, typically longer-lived than the bootstrap token

### 5.2 Vault Model

Vault behavior is defined by the current wrapper-based model, not by a plaintext fallback path.

- Encryption at rest is mandatory
- Passphrase and recovery wrappers are mandatory
- Optional quick-unlock methods wrap the same DEK
- `vault_keys` and `vault_key_wrappers` hold metadata and wrappers, not plaintext user data
- The backend never becomes the holder of the user’s raw vault key

### 5.3 World Model and Storage Boundary

The private data architecture is domain-driven and encrypted:

- `world_model_data`: encrypted private user content
- `world_model_index_v2`: sanitized metadata and summaries
- `vault_keys` / `vault_key_wrappers`: unlock metadata and wrappers
- `kai_market_cache_entries`: backend cache for market-home payloads

Current storage boundary:

- Private encrypted user content stays in the world model
- Public discovery, consent workflow, verification/compliance, and IAM structures live in relational tables
- RIA does not create a second private data plane

### 5.4 IAM and Persona State

Investor/RIA IAM is an implemented runtime surface, gated by schema readiness.

Key points:

- `actor_profiles.last_active_persona` is the canonical persisted persona state
- `runtime_persona_state` is compatibility-only transitional state
- IAM schema readiness controls whether RIA routes are fully available
- Current IAM/public workflow tables include `actor_profiles`, `ria_profiles`, `ria_firms`, `ria_firm_memberships`, `ria_verification_events`, `advisor_investor_relationships`, `ria_client_invites`, `consent_scope_templates`, and `marketplace_public_profiles`

## 6. Current Kai Runtime

Kai is the primary runtime product and the main implemented agent system in this repo.

Current characteristics:

- Multi-agent financial analysis using specialist sub-agents
- Debate-style synthesis and structured `DecisionCard` output
- Streaming analysis and portfolio import contracts
- Cache-first market-home flow with explicit degraded/provider status handling
- Portfolio import, world-model persistence, dashboard analytics, and analysis workflows are wired through the current route/service stack

Current data flow highlights:

- Onboarding and profile state reconcile into encrypted `financial.profile`
- Portfolio data persists into encrypted `financial` domain data
- `/kai` market home uses cache-first token-gated payloads
- `/kai/dashboard` and `/kai/analysis` build from world-model state, cached summaries, and Kai analysis flows

## 7. Current API and Route Surface

Active backend route families include:

- `/api/consent/*`
- `/api/world-model/*`
- `/api/kai/*`
- `/api/iam/*`
- `/api/ria/*`
- `/api/marketplace/*`
- `/api/notifications/*`
- `/api/account/*`
- `/db/*` for specific vault/database proxy surfaces

Active frontend route governance is based on:

- `docs/reference/architecture/route-contracts.md`
- `hushh-webapp/route-contracts.json`

Engineering changes that add or alter product routes are expected to update contracts, proxy paths, and parity checks together.

## 8. Current Operational Expectations

Minimum working expectations for engineering in this repo:

- Frontend checks: typecheck, lint, build, tests, design-system verification, investor-language verification, route verification
- Backend checks: Ruff, mypy, pytest
- Integration checks: route-contract verification
- Release/preflight checks: cache, docs parity, native parity, route parity, environment parity, and launch smoke scripts

Useful references:

- `TESTING.md`
- `docs/reference/operations/ci.md`
- `docs/reference/quality/pr-impact-checklist.md`

## 9. What Is Not Current Runtime Truth

The following themes appear in the original engineering PDF, but they are not current repo-level runtime truth unless separately promoted into canonical docs and code:

- Salesforce CRM as the implemented personal-data system of record
- Agentforce and MuleSoft as the implemented production agent hosting and governance plane
- Mandatory A2A for all inter-agent traffic
- Mandatory UCP for commerce execution
- Siri-first App Intents as the primary active runtime surface
- Fully shipped on-device MLX or hybrid/offline AI as the current default runtime
- Universal enterprise-system coverage across finance, health, travel, commerce, and work

## 10. Future State

The repo does contain future-facing direction, but it is explicitly marked as plan or vision material rather than shipped runtime truth.

### 10.1 On-Device and Hybrid AI

Current status in repo docs: future plan, cloud remains primary.

Likely direction:

- optional hybrid and on-device modes
- local OCR/STT/TTS and compact SLM packaging
- degraded/offline flows on supported devices

Source anchors:

- `docs/reference/ai/on-device-future-plan/README.md`
- `docs/reference/ai/on-device-future-plan/pathway-b-balanced-hybrid.md`

### 10.2 Multi-Domain Personal Agent Expansion

Current repo vision extends beyond Kai into broader personal-agent domains, but those are not the dominant implemented runtime today.

Examples mentioned in vision materials:

- food and dining
- finance beyond investing
- health
- professional data
- broader consent-mediated agent interactions

### 10.3 Broader External Agent and Enterprise Ecosystem

Concepts such as Agent Nav, wider agent-to-agent interoperability, enterprise connector breadth, and possible backbone partnerships remain future-facing unless implemented code and canonical docs promote them into current runtime truth.

## 11. Canonical Anchors for Engineers

Read these before making architecture-affecting changes:

- `docs/project_context_map.md`
- `docs/reference/architecture/architecture.md`
- `docs/reference/architecture/api-contracts.md`
- `docs/reference/architecture/route-contracts.md`
- `docs/reference/architecture/runtime-db-fact-sheet.md`
- `docs/reference/iam/architecture.md`
- `docs/reference/iam/runtime-surface.md`
- `docs/reference/kai/kai-interconnection-map.md`
- `hushh-webapp/README.md`
- `consent-protocol/README.md`
