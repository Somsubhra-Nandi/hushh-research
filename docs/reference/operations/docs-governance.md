# Docs Governance

## Purpose

Define one durable documentation model across:

- `docs/` (cross-cutting)
- `consent-protocol/docs/` (backend)
- `hushh-webapp/docs/` (frontend/native)

## Naming Rules

1. Index files must be named `README.md`.
2. Non-index docs must use `kebab-case.md`.
3. Avoid temporary plan docs in `docs/reference/`.
4. Keep paths stable; if moved, update all inbound links in the same PR.

## Placement Rules

1. Put implementation-specific backend docs in `consent-protocol/docs/`.
2. Put frontend/native implementation docs in `hushh-webapp/docs/`.
3. Keep cross-cutting architecture/ops/policy docs in root `docs/`.
4. Do not duplicate source-of-truth content across homes; link instead.
5. Put AI strategy/runtime planning in `docs/reference/ai/` unless it is backend- or frontend-only.

## Required Quality Gates

1. `npm run verify:docs` (runtime/doc parity gate)
2. `node scripts/verify-doc-links.cjs` (broken link + dead path gate)

Both gates must pass in CI before merge.

CI gate policy:

1. Keep a minimal blocking set (secret scan, web, protocol, integration).
2. Treat docs parity and subtree drift as advisory unless explicitly promoted.
3. Do not add a new CI/parity script unless it replaces or consolidates an existing script in the same PR.
4. Every new CI/helper script must declare owner team (`frontend`, `backend`, or `platform`) and get owner approval.

## One-Time Rules

1. If a route/component/API is deleted, remove doc references in the same change.
2. If a public contract changes, update both docs and contract verification artifacts.
3. If a file is renamed, update all links immediately; no deferred follow-up.
4. Any future-plan document must include an explicit `Status` section and a promotion rule before it can be treated as implementation reference.

## Ownership

1. Product + platform docs in `docs/`: repository maintainers.
2. Backend docs in `consent-protocol/docs/`: backend owners.
3. Frontend/native docs in `hushh-webapp/docs/`: frontend/native owners.
