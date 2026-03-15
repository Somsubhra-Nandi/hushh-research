# Getting Started

> Canonical local setup guide for the Hushh monorepo.

---

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 20+ |
| Python | 3.13+ |
| Git | current |
| PostgreSQL-compatible runtime | local Postgres or Supabase-backed profile |

Optional for native work:

| Tool | Purpose |
| --- | --- |
| Xcode + CocoaPods | iOS |
| Android Studio | Android |

---

## Clone And Bootstrap

```bash
git clone https://github.com/hushh-labs/hushh-research.git
cd hushh-research
make setup
```

Install package dependencies:

```bash
cd hushh-webapp && npm install
cd ../consent-protocol
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

Use `.venv` as the backend virtual environment. Do not maintain a second `venv` alongside it.

---

## Environment Setup

The canonical env contract is documented in [../reference/operations/env-and-secrets.md](../reference/operations/env-and-secrets.md).

Current default workflow uses runtime profiles rather than ad hoc manual env assembly.

Bootstrap local profiles:

```bash
bash scripts/env/bootstrap_profiles.sh
```

Activate a profile into `consent-protocol/.env` and `hushh-webapp/.env.local`:

```bash
bash scripts/env/use_profile.sh local-uatdb
```

Supported profile names:

- `local-uatdb`
- `uat-remote`
- `prod-remote`

Important env rules:

- backend database configuration uses `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_NAME`
- backend signing/runtime secrets come from the documented `SECRET_KEY`, Firebase, and Google keys
- frontend runtime uses `NEXT_PUBLIC_*` keys plus server-side fallback keys where documented
- `DATABASE_URL` is not part of the supported runtime contract

---

## Running Locally

Canonical launchers:

```bash
make local
make uat
make prod
```

Useful narrower launchers:

```bash
make local-web
make uat-web
make prod-web
make local-backend
```

Manual backend start after activating `.venv` and the selected profile:

```bash
cd consent-protocol
source .venv/bin/activate
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected outcomes:

- frontend available at `http://localhost:3000`
- backend responds on `http://localhost:8000`
- profile-based launchers resolve the correct runtime profile before boot
- IAM schema verification passes before `make local` and `make local-backend` continue

---

## Database And Migrations

SQL migrations live in `consent-protocol/db/migrations/`.

Do not use `psql $DATABASE_URL ...` guidance here. Runtime and migration scripts are aligned to the `DB_*` contract.

For IAM schema setup and verification:

```bash
make db-init-iam
make verify-iam-schema
```

For profile-backed local startup, `make local` and `make local-backend` already run IAM schema verification before boot.

---

## Verification

Run the common local checks before opening a PR:

```bash
./scripts/test-ci-local.sh
make verify-docs
cd hushh-webapp && npm run verify:routes
```

Useful quick checks after first boot:

- open the frontend and confirm the login screen renders
- hit `curl http://localhost:8000/health`
- run `cd hushh-webapp && npm run typecheck` if you changed frontend code
- run targeted backend `pytest` if you changed protocol/runtime behavior

Package-local docs for deeper implementation detail:

- backend/protocol: [../../consent-protocol/docs/README.md](../../consent-protocol/docs/README.md)
- frontend/native: [../../hushh-webapp/docs/README.md](../../hushh-webapp/docs/README.md)

---

## Related References

- architecture: [../reference/architecture/architecture.md](../reference/architecture/architecture.md)
- API contracts: [../reference/architecture/api-contracts.md](../reference/architecture/api-contracts.md)
- route governance: [../reference/architecture/route-contracts.md](../reference/architecture/route-contracts.md)
- env and secrets: [../reference/operations/env-and-secrets.md](../reference/operations/env-and-secrets.md)
- mobile/native workflow: [./mobile.md](./mobile.md)
