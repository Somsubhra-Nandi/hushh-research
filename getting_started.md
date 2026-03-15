# Getting Started

This file is a repo-root entrypoint. The maintained setup guide lives at [`docs/guides/getting-started.md`](./docs/guides/getting-started.md).

## What You’re Bootstrapping

Hushh in this repo is the current Kai + IAM/RIA + consent/world-model stack:

- encrypted user-private data through the world-model boundary
- consent-first runtime access with auditability
- web, iOS, and Android parity through the tri-flow model

## Quick Bootstrap

```bash
git clone https://github.com/hushh-labs/hushh-research.git
cd hushh-research
make setup
cd hushh-webapp && npm install
cd ../consent-protocol
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
bash scripts/env/bootstrap_profiles.sh
make local
```

Expected local endpoints after boot:

- frontend: `http://localhost:3000`
- backend health: `http://localhost:8000/health`

## Read In This Order

1. [`docs/guides/getting-started.md`](./docs/guides/getting-started.md) for local setup, runtime profiles, and launch commands.
2. [`docs/reference/operations/env-and-secrets.md`](./docs/reference/operations/env-and-secrets.md) for the canonical `DB_*`, Firebase, and runtime environment contract.
3. [`docs/reference/architecture/architecture.md`](./docs/reference/architecture/architecture.md) for the current system map.
4. [`docs/reference/operations/branch-governance.md`](./docs/reference/operations/branch-governance.md) for branch lanes and deployment policy.
5. [`docs/reference/operations/ci.md`](./docs/reference/operations/ci.md) for blocking CI and local parity.
6. [`docs/reference/operations/coding-agent-mcp.md`](./docs/reference/operations/coding-agent-mcp.md) for coding-agent MCP tooling.

## Package Entry Points

- Backend/protocol setup details: [`consent-protocol/docs/README.md`](./consent-protocol/docs/README.md)
- Frontend/native setup details: [`hushh-webapp/docs/README.md`](./hushh-webapp/docs/README.md)

## Notes

- Root docs do not carry independent setup truth anymore.
- This file should keep one-screen onboarding value, but detailed operational truth belongs in the canonical docs under `docs/`, `consent-protocol/docs/`, or `hushh-webapp/docs/`.
