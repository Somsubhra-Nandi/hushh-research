# CI Configuration Reference

This document describes the **Tri-Flow CI** workflow and how to stay aligned with it so code changes do not fail CI. Run local checks before every commit.

**Workflow file:** [.github/workflows/ci.yml](../../.github/workflows/ci.yml)  
**Local mirror:** [scripts/test-ci-local.sh](../../scripts/test-ci-local.sh)  
**Simulation (extended):** [scripts/test-ci-simulation.sh](../../scripts/test-ci-simulation.sh)

---

## When CI Runs

| Trigger | Branches | Behavior |
|--------|-----------|----------|
| Pull request | All branches (`**`) | Full CI (path-filtered) |
| Push | All branches (`**`) | Full CI (path-filtered) |
| Merge queue | `main` | Full CI (frontend + backend forced on) |
| Manual | Any | **workflow_dispatch** with scope: `frontend` \| `backend` \| `all` |

**Path filters:** Jobs run only when relevant paths change for `push`/`pull_request` (or when run manually with a scope). Merge queue runs both stacks for deterministic gating.

- **Frontend job** runs when `hushh-webapp/**` changes.
- **Backend job** runs when `consent-protocol/**` changes.
- **Integration job** runs when either frontend or backend paths change.

---

## Global Gates (Always Run)

| Gate | Purpose | Behavior |
|------|---------|----------|
| Secret Scan | Detect leaked credentials/tokens early | `gitleaks` OSS CLI (license-free) scans commit range for each event |
| Upstream Sync | Detect monorepo/subtree drift | Warns when `consent-protocol/` tree differs from upstream `main` |
| CI Status Gate | Single required check for branch protection | Fails if any required job fails/cancels/times out; allows intentional `skipped` jobs |

---

## Required Versions (Must Match CI)

| Tool | CI Version | Local requirement |
|------|------------|-------------------|
| Node.js | 20 | 20+ (see [test-ci-local.sh](../../scripts/test-ci-local.sh)) |
| Python | 3.13 | 3.13 (CI asserts exactly 3.13) |
| npm | latest | Use latest (script upgrades before run) |
| pip | latest | Use latest (script upgrades before run) |

Using a different Node or Python locally can cause “pass locally, fail in CI” if behavior or dependencies differ.

---

## Frontend Checks (Web / Next.js)

**Working directory:** `hushh-webapp/`

| Step | Command / behavior | Fails CI? |
|------|--------------------|-----------|
| Validate files | `package-lock.json` exists and valid JSON; `next.config.ts` exists | Yes |
| Install | `npm ci` | Yes |
| TypeScript | `npx tsc --noEmit` | Yes |
| Lint | `npm run lint` (ESLint) | Yes |
| Build (web) | `npm run build` (Next.js) | Yes |
| Build (Capacitor) | `npm run cap:build` with `CAPACITOR_BUILD=true` | Yes |
| Security audit | `npm audit --audit-level=high` | Yes |
| Tests | `npm test` | Yes |

**Build env (CI):** `NEXT_PUBLIC_BACKEND_URL` and all six `NEXT_PUBLIC_FIREBASE_*` vars are set to placeholders in the workflow so the build does not depend on real secrets.

**Coding rules that affect CI:**

- Do **not** use `fetch("/api/...")` in components or pages; use the service layer (see [Architecture](./architecture.md)).
- ESLint must pass with no **errors** (warnings may exist but should be cleaned up over time).
- TypeScript must compile with no errors.

---

## Backend Checks (Python / FastAPI)

**Working directory:** `consent-protocol/`

| Step | Command / behavior | Fails CI? |
|------|--------------------|-----------|
| Validate files | `requirements.txt` exists; optional `requirements-dev.txt`, `tests/` | No (warnings only) |
| Install | `pip install -r requirements.txt` then `requirements-dev.txt` or pytest/mypy/ruff | Yes |
| Lint | `python -m ruff check .` | Yes |
| Type check | `python -m mypy --config-file pyproject.toml --ignore-missing-imports` | Yes |
| Tests | `pytest tests/ -v --tb=short --cov=hushh_mcp --cov-report=xml --cov-report=term` | Yes |

**Test env (CI):**  
`TESTING=true`, `SECRET_KEY`, and `VAULT_ENCRYPTION_KEY` are set in the workflow (see [ci.yml](../../.github/workflows/ci.yml)).

**Consent-token rule for automated tests:** Use fixture-issued VAULT_OWNER tokens from `consent-protocol/tests/conftest.py`. `consent-protocol/tests/dev_test_token.py` is debug-only and must not be required by CI.

**Config files:**

- **Ruff:** [consent-protocol/pyproject.toml](../../consent-protocol/pyproject.toml) — `[tool.ruff]` and `[tool.ruff.lint]`. Target Python 3.13, line-length 100, selected rules (E, F, B, I, S), per-file ignores for tests and routes.
- **Mypy:** Same `pyproject.toml` — `[tool.mypy]`. Python 3.13, `warn_return_any`, `ignore_missing_imports`, overrides for `hushh_mcp.*` and consent/vault.

**Coding rules that affect CI:**

- Use **Python 3.13**-compatible syntax and types.
- Avoid ambiguous names (e.g. single-letter `l`) so Ruff doesn’t flag them.
- Optional args: use `Optional[T] = None`, not `T = None`, to satisfy mypy.
- Return types: avoid returning untyped `Any` from functions that declare a concrete return type; use `cast()` or correct types so mypy passes.
- New backend code under `consent-protocol/` is type-checked and linted; keep `api/` and `db/` aligned with mypy and Ruff.

---

## Integration Check (Route Contracts)

**Runs when:** Frontend or backend paths change (or manual run with scope that includes either).

| Step | Command / behavior | Fails CI? |
|------|--------------------|-----------|
| Install | `npm ci` in `hushh-webapp/` | Yes |
| Verify | `npm run verify:routes` (script: `hushh-webapp/scripts/verify-route-contracts.cjs`) | Yes |

Route contracts must stay in sync between frontend expectations and backend (or proxy) routes. See [API Contracts](api-contracts.md). If you add or change API routes, update the contract and run `npm run verify:routes` (or full local CI).

---

## Streaming Contract Gates

Canonical streaming is a production contract, not an implementation detail.

- Contract source: [Streaming Contract](./streaming-contract.md)
- Runtime pattern: [Streaming Implementation Guide](./streaming-implementation-guide.md)
- Vertex constraints: [Vertex AI Streaming Notes](./vertex-ai-streaming-notes.md)

Minimum checks for streaming changes:

- Frontend parser tests: `cd hushh-webapp && npm test -- __tests__/streaming`
- Frontend stream proxy tests: `cd hushh-webapp && npm test -- __tests__/api/kai`
- Backend stream/auth tests: `cd consent-protocol && pytest tests/test_kai_auth_matrix.py`

---

## Running CI Locally (Before Every Commit)

**Recommended:** Run the script that mirrors CI. It uses the same versions and steps as GitHub Actions.

```bash
./scripts/test-ci-local.sh
```

This script:

1. Validates required files (e.g. `package-lock.json`, `next.config.ts`, `requirements.txt`, test files).
2. Checks Node (20+) and Python (3.13) and upgrades npm/pip.
3. Runs **frontend** checks: install, `tsc`, lint, Next build, Capacitor build.
4. Runs **backend** checks: install, Ruff, mypy, pytest.
5. Runs **integration**: route contract verification.

If it exits 0, CI should pass. If it fails, fix the reported step before committing.

**Alternative (extended simulation):**  
`./scripts/test-ci-simulation.sh` runs additional edge-case and validation steps; use when you want to stress-test the same setup as CI.

---

## Quick Reference: Commands That Must Succeed

| Area | Commands (from repo root) |
|------|----------------------------|
| Frontend | `cd hushh-webapp && npm ci && npx tsc --noEmit && npm run lint && npm run build && npm run cap:build` |
| Backend | `cd consent-protocol && pip install -r requirements.txt -r requirements-dev.txt && ruff check . && mypy --config-file pyproject.toml --ignore-missing-imports && pytest tests/` |
| Integration | `cd hushh-webapp && npm ci && npm run verify:routes` |
| All | `./scripts/test-ci-local.sh` |

---

## Related Docs

- [Getting Started](../guides/getting-started.md) -- Setup and local CI instructions.
- [API Contracts](api-contracts.md) -- API contract verification.
- [Architecture](./architecture.md) -- Tri-Flow and service-layer rules.
- [Streaming Contract](./streaming-contract.md) -- Canonical SSE contract.

---

## Upstream CI (consent-protocol standalone)

The consent-protocol has its own full CI pipeline at [hushh-labs/consent-protocol](https://github.com/hushh-labs/consent-protocol/actions). It now runs on all branches plus merge queue and includes: secret scan, lint, typecheck, test, security scan, Docker build verification, and a final status gate.

The monorepo `protocol-check` job is a lightweight mirror. For full coverage, PRs to the upstream repo are the authoritative gate.
