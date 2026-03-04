# Route Contracts

> Governance for Next.js proxy routes and their tri-flow counterparts.

Hushh uses a contract manifest to keep the API surface honest:

- Every Next.js API route under `hushh-webapp/app/api/**/route.ts` must be declared in `hushh-webapp/route-contracts.json`, or explicitly allowlisted.
- Each contract can assert:
  - Backend router prefix + paths exist (simple source checks against FastAPI files)
  - Native plugin files exist (TS + iOS + Android)
  - TS plugin exports include required method names

This supports the repo's north-star invariants: **Tri-Flow**, **consent-first boundaries**, and **auditability**.

## Files

- Manifest: `hushh-webapp/route-contracts.json`
- Verifier: `hushh-webapp/scripts/verify-route-contracts.cjs`
- Run locally:
  - `cd hushh-webapp && npm run verify:routes`
  - `cd hushh-webapp && npm run verify:capacitor:routes`

## Canonical App Routes (Current)

Keep navigation contract aligned with `hushh-webapp/lib/navigation/routes.ts`:

- `/`
- `/login`
- `/kai/onboarding`
- `/kai/import`
- `/kai`
- `/kai/dashboard`

Legacy alias routes and legacy nav surfaces (for example, `agent-nav`) must not be reintroduced into primary navigation contracts.

## When To Update `route-contracts.json`

Update the manifest whenever you:

- Add a new Next.js API route under `hushh-webapp/app/api/`
- Change a backend router prefix or path
- Add/rename a Capacitor plugin method that must exist in TS/iOS/Android

## Contract Shape (High Level)

Each entry under `contracts[]` typically includes:

- `id`: stable identifier (used in error messages)
- `webRouteFile` or `webRouteFiles`: repo-relative path(s) to Next.js `route.ts`
- `backend` (optional):
  - `file`: FastAPI router module file path
  - `routerPrefix`: `APIRouter(prefix="...")` value
  - `paths`: list of route path strings (without the prefix)
- `native` (optional):
  - `tsPluginFile`: TS `registerPlugin(...)` export file
  - `iosPluginFile`: Swift plugin file
  - `androidPluginFile`: Kotlin plugin file
  - `requiredMethodNames`: method names expected to exist in the TS plugin file

## Allowlisting (Use Sparingly)

`allowlistedWebRouteFiles` is for routes that are intentionally not governed by a contract (for example: web-only utilities or special-case configuration routes).

Default stance:
- If a route is part of a tri-flow feature, add a real `contracts[]` entry.
- Use the allowlist only when you can justify why a contract should not exist.

## Relationship To API Contracts

- `docs/reference/architecture/api-contracts.md` documents the endpoint surface (what exists and how to call it).
- `route-contracts.json` is a governance manifest that prevents drift and undeclared routes in `hushh-webapp/app/api/`.
