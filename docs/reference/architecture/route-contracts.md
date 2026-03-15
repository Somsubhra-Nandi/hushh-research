# Route Contracts

> Governance for Next.js proxy routes, native plugin parity, and app navigation truth.

Hushh uses a contract manifest to keep the declared runtime surface aligned across:

- Next.js API route handlers under `hushh-webapp/app/api/**/route.ts`
- backend router prefixes and path families
- Capacitor TypeScript, iOS, and Android plugin surfaces

## Files

- Manifest: `hushh-webapp/route-contracts.json`
- Verifier: `hushh-webapp/scripts/verify-route-contracts.cjs`
- Run locally:
  - `cd hushh-webapp && npm run verify:routes`
  - `cd hushh-webapp && npm run verify:capacitor:routes`

## Canonical App Routes

Keep navigation documentation aligned with `hushh-webapp/lib/navigation/routes.ts`:

- `/`
- `/login`
- `/logout`
- `/labs/profile-appearance`
- `/profile`
- `/consents`
- `/marketplace`
- `/marketplace/ria`
- `/ria`
- `/ria/onboarding`
- `/ria/clients`
- `/ria/requests`
- `/ria/settings`
- `/kai`
- `/kai/onboarding`
- `/kai/import`
- `/kai/plaid/oauth/return`
- `/kai/portfolio`
- `/kai/analysis`
- `/kai/optimize`

Implemented route families that are not represented as named constants but still belong to the live app surface:

- `/marketplace/ria/[riaId]`
- `/ria/workspace/[clientId]`

Legacy navigation surfaces and aliases must not be reintroduced without updating both `routes.ts` and this reference.

## When To Update `route-contracts.json`

Update the manifest whenever you:

- add a new Next.js API route under `hushh-webapp/app/api/`
- change a backend router prefix or supported backend path family
- add, remove, or rename a Capacitor plugin method that must exist in TS, iOS, and Android
- intentionally retire an old proxy or plugin surface

## Contract Shape

Each `contracts[]` entry typically includes:

- `id`: stable identifier used in verification errors
- `webRouteFile` or `webRouteFiles`: repo-relative Next.js `route.ts` files
- `backend`:
  - `file`: FastAPI router module path
  - `routerPrefix`: declared `APIRouter(prefix="...")`
  - `paths`: supported path family list relative to the prefix
- `native`:
  - `tsPluginFile`: TypeScript plugin export
  - `iosPluginFile`: Swift plugin
  - `androidPluginFile`: Kotlin plugin
  - `requiredMethodNames`: TS methods that must exist

## Allowlisting

`allowlistedWebRouteFiles` is reserved for intentional exceptions such as web-only utilities.

Default stance:

- tri-flow features should use a real contract entry
- removed legacy routes should be deleted, not allowlisted
- wildcard proxies should be constrained to supported backend paths

## Relationship To Other Docs

- [api-contracts.md](./api-contracts.md) describes the API surface itself.
- `route-contracts.json` is a guardrail that prevents undeclared route drift.
