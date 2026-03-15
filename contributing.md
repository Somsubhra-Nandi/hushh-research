# Contributing

This file is a repo-root contribution entrypoint. Detailed workflow rules live in the canonical docs tree.

## Non-Negotiable Engineering Rules

- Tri-flow: cross-boundary product features must stay aligned across web, iOS, and Android.
- Consent-first: do not add hidden bypasses around token-gated access paths.
- BYOK: private user data stays encrypted client-side; the server should not depend on plaintext user secrets.
- Canonical docs: update the maintained docs and verification artifacts when contracts change.

## Read Before Changing Code

- feature workflow: [`docs/guides/new-feature.md`](./docs/guides/new-feature.md)
- subtree workflow for `consent-protocol/`: [`docs/guides/subtree-sync.md`](./docs/guides/subtree-sync.md)
- architecture and runtime map: [`docs/reference/architecture/architecture.md`](./docs/reference/architecture/architecture.md)
- route governance and tri-flow contracts: [`docs/reference/architecture/route-contracts.md`](./docs/reference/architecture/route-contracts.md)
- branch policy and release lanes: [`docs/reference/operations/branch-governance.md`](./docs/reference/operations/branch-governance.md)
- CI policy: [`docs/reference/operations/ci.md`](./docs/reference/operations/ci.md)
- coding-agent MCP tooling: [`docs/reference/operations/coding-agent-mcp.md`](./docs/reference/operations/coding-agent-mcp.md)
- profile/settings design language: [`docs/reference/quality/profile-settings-design-system.md`](./docs/reference/quality/profile-settings-design-system.md)
- package docs:
  - backend: [`consent-protocol/docs/README.md`](./consent-protocol/docs/README.md)
  - frontend/native: [`hushh-webapp/docs/README.md`](./hushh-webapp/docs/README.md)

## Local Contributor Bootstrap

```bash
make setup
make verify-setup
./scripts/test-ci-local.sh
```

## Subtree Workflow Summary

If you touch `consent-protocol/`, treat the subtree sync flow as part of the change:

- sync before backend work: `make sync-protocol`
- keep hooks healthy: `make verify-setup`
- push back upstream after merge when appropriate: `make push-protocol`

## Contribution Rules

- Branch from `main` and target pull requests back to `main`.
- Keep `deploy_uat` and `deploy` as release lanes that are promoted from `main`, not feature-development branches.
- Keep runtime truth in canonical docs, not root markdown.
- Maintain web, iOS, and Android parity for tri-flow features.
- Treat consent boundaries and world-model contracts as hard constraints.
- Do not introduce new routes, env vars, or runtime surfaces without updating their canonical references and verification gates.

## Pull Request Expectations

- explain what changed and why
- note any route, plugin, or contract surface changes
- mention local verification you ran
- include screenshots or recordings for user-facing UI changes when useful
