# Hushh Personal Agent Product Specification

Temporary current-state rewrite aligned to the repository as of March 13, 2026.

This file is a working correction of `temp/Hushh-Product-Specification-v2_0.pdf`. It translates the product narrative into what is currently true in the repo, while preserving future-oriented ideas only inside an explicit future-state section.

## 1. Product Summary

Hushh today is a consent-first personal-agent platform with Kai as the primary active product surface and an expanding Investor/RIA experience under the same product shell.

What is true in the current repo:

- Kai is the primary shipped focus
- The system is built around private encrypted data, consent-gated access, and auditability
- The product is investor-first today, with active RIA onboarding, IAM, marketplace, and consent-center rollout
- The web app is the core runtime, with Capacitor-backed iOS and Android parity as a standing requirement

What is not current repo truth:

- a fully autonomous universal personal agent already integrated with every enterprise system of record
- a fully shipped Siri-first or on-device-first product experience
- a current production backbone in this repo built around Salesforce Agentforce and MuleSoft

## 2. Product Pillars That Are True Today

### 2.1 Consent Before Access

The product treats consent as a runtime requirement, not a policy footnote.

- Sign-in establishes identity, not data access
- Private data operations require consent tokens
- Consent workflow, approval, revocation, and audit history are implemented product surfaces

### 2.2 BYOK and Private Data Ownership

The current product direction is built around encrypted private storage.

- Vault unlock happens client-side
- The backend stores ciphertext and metadata, not plaintext user data
- Recovery and passphrase wrappers are first-class parts of the product

### 2.3 Tri-Flow Product Delivery

The product is expected to work across:

- web
- iOS
- Android

This is not optional quality polish. It is part of the product contract.

### 2.4 Kai as the Primary Runtime Product

Kai is the most concrete current expression of the Hushh product.

- onboarding and persona capture
- portfolio import
- market-home experience
- dashboard analytics
- debate-style stock analysis
- consent-aware personalization and history

## 3. Current User-Facing Product Surface

### 3.1 Public and Auth

- `/`: public marketing and onboarding-oriented landing surface
- `/login`: authentication entry point
- `/logout`: logout surface

### 3.2 Investor and Kai

- `/kai/onboarding`: canonical onboarding questionnaire and persona capture
- `/kai/import`: portfolio connection/import flow and vault introduction moment
- `/kai`: signed-in market home
- `/kai/dashboard`: portfolio analytics and dashboard experience
- `/kai/analysis`: analysis workflow
- `/kai/optimize`: optimization surface present in the app route tree

### 3.3 Shared Product Surfaces

- `/marketplace`: investor and RIA discovery surface
- `/consents`: shared workflow hub for requests, grants, history, invites, and related access workflows
- `/profile`: shared account, persona, and settings surface

### 3.4 RIA Expansion Surface

- `/ria`: RIA shell entry
- `/ria/onboarding`: advisor onboarding and verification staging
- `/ria/clients`: advisor relationship roster
- `/ria/workspace/[clientId]`: advisor client workspace
- `/ria/requests` and `/ria/settings`: compatibility routes into consent/profile flows

## 4. Current Experience Flows

### 4.1 Post-Login Routing

Post-auth routing is not generic or purely marketing-driven. It follows current product state.

- If the active persona is RIA and IAM is ready, login can route into the RIA surface
- If no vault exists, the product resolves through onboarding/pre-vault state first
- If a vault exists, the product routes to the intended signed-in flow

This behavior is implemented in the current frontend service layer and persona state model.

### 4.2 Onboarding and Vault Introduction

Current onboarding is tied to both persona progression and vault-aware continuity.

- pre-vault state exists to support early product progress before full vault flows
- canonical cross-device onboarding state lands in encrypted profile data after vault context is available
- first-time users are not forced into vault unlock unless a vault already exists and protected access requires it

### 4.3 Kai Home and Dashboard

The current Kai experience is not a single chat screen.

- `/kai` is a token-gated market-home surface
- home data is cache-first and explicit about degraded or partial provider states
- `/kai/dashboard` builds from imported holdings, world-model data, and derived analytics

### 4.4 Analysis and Import

Kai’s current core workflows are operational product surfaces:

- statement import and streaming import review
- encrypted portfolio persistence
- structured multi-agent stock analysis
- streaming analysis events with typed terminal results

### 4.5 Consent Center and Marketplace

The product already includes shared surfaces for access workflows:

- incoming and outgoing consent requests
- history and active grants
- invite flows
- marketplace discovery across investor and RIA contexts

### 4.6 RIA Onboarding and Persona Switching

RIA is not just a future concept in this repo. It is an active, migration-gated product area.

- persona state is stored and resolved through IAM routes
- RIA onboarding collects identity, credentials, firm context, profile, and activation state
- verification is fail-closed when IAM schema or verification state is not ready
- dev bypass exists only in controlled non-production conditions

## 5. Current Product Data Model

### 5.1 Private User Data

Private user content is stored as encrypted world-model data.

- `financial.profile` is the canonical encrypted source for onboarding-related Kai profile state
- broader private data domains live in encrypted world-model storage
- client-side vault context is required to meaningfully use the encrypted payloads

### 5.2 Public and Workflow Data

Not all product data belongs in the encrypted world model.

Current relational data includes:

- actor and persona state
- RIA profiles and firms
- verification events
- advisor-investor relationships
- consent scope templates
- marketplace public profiles
- consent audit and workflow state

### 5.3 No Second Private Data Plane for RIA

RIA extends the product workflow and IAM model, but it does not introduce a second private storage architecture separate from the current world-model boundary.

## 6. Current Trust, Compliance, and Product Messaging

### 6.1 Educational Positioning for Kai

Current repo messaging and architecture frame Kai as an explainable financial analysis product, not as a registered investment adviser.

### 6.2 Explicit Auditability

Important product actions are designed to be reviewable:

- consent issuance and revocation
- access requests
- token-scoped operations
- degraded runtime states in market and analysis flows

### 6.3 Migration-Gated RIA Reality

The repo explicitly acknowledges partial rollout states.

- IAM can return investor-safe compatibility payloads when schema is not ready
- RIA routes fail closed until the required schema and runtime surfaces are available
- this is current product behavior, not an edge case

## 7. What The Current Product Does Not Claim

This rewrite intentionally does not restate the following PDF claims as present truth:

- Hushh already knows everything about the user across every enterprise system
- users can operate with zero forms and zero setup across all domains today
- every user already receives fully provisioned Kai and Nav agents hosted in a generalized external enterprise backbone
- commerce, travel, health, work, and all other domains are already implemented to the same maturity as Kai investing
- shipped Siri/App Intent and on-device MLX execution are the current primary customer experience

## 8. Future State

The repo contains clear future direction. That direction matters, but it must remain clearly labeled until promoted by code and canonical docs.

### 8.1 Broader Personal-Agent Scope

Vision materials point beyond investing toward a wider personal-agent system across domains such as food, finance, health, professional data, and broader consent-mediated workflows.

### 8.2 On-Device and Hybrid AI

Current repo docs mark on-device and hybrid AI as future plan material.

Expected direction:

- cloud remains the current default
- hybrid mode adds local OCR/STT/TTS and fallback patterns
- deeper offline or local reasoning becomes additive on supported devices

### 8.3 Agent Nav and Wider Agent Ecosystem

The PDFs describe Agent Nav and a broader personal-agent fabric. In the current repo, those ideas are closer to vision language than to an already-shipped standalone runtime surface.

### 8.4 Broader Enterprise Connectivity and Commerce

The PDFs frame universal connectors, A2A, MCP breadth, and commerce standards as central long-term product direction. In the current repo, those are not yet equivalent to a fully realized, universal consumer product across every domain.

## 9. Canonical Product Anchors

Use these when deciding what is true about the product right now:

- `docs/project_context_map.md`
- `docs/reference/architecture/architecture.md`
- `docs/reference/architecture/route-contracts.md`
- `docs/reference/architecture/api-contracts.md`
- `docs/reference/iam/architecture.md`
- `docs/reference/iam/runtime-surface.md`
- `docs/reference/kai/kai-interconnection-map.md`
- `docs/vision/README.md`
- `docs/vision/kai/README.md`
- `hushh-webapp/README.md`
- `consent-protocol/README.md`
