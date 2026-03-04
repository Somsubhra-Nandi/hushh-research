# Mobile Kai Parity Map

Route-level and feature-level parity contract for Kai on Web, iOS, and Android.

## Route-Level Parity

| Route | Web | iOS (Capacitor) | Android (Capacitor) | Verification |
| --- | --- | --- | --- | --- |
| `/kai/import` | Yes | Yes | Yes | `npm run verify:capacitor:routes` + runtime audit |
| `/kai` | Yes | Yes | Yes | `npm run verify:capacitor:routes` + runtime audit |
| `/kai/dashboard` | Yes | Yes | Yes | `npm run verify:capacitor:routes` + runtime audit |
| `/kai/dashboard/analysis` | Yes | Yes | Yes | `npm run verify:capacitor:routes` + runtime audit |
| `/kai/dashboard/portfolio-health` | Yes | Yes | Yes | `npm run verify:capacitor:routes` + runtime audit |

## Feature-Level Parity

| Capability | Web Path | Native Path | Contract Notes |
| --- | --- | --- | --- |
| Import stream envelope consumption | Next proxy + browser stream parser | Kai plugin stream bridge -> ReadableStream | Must consume canonical SSE envelope (`schema_version=1.0`) |
| Analysis stream + decision terminal payload | `/api/kai/analyze/stream` via web fetch | Kai plugin stream methods | Must emit terminal `decision`/`error`; decision includes degraded metadata |
| Token guard + one retry on 401/403 | `ensureKaiVaultOwnerToken` | same service-layer guard before plugin/network call | Strict VAULT_OWNER policy applies uniformly |
| Cache-first market home refresh | in-memory + session cache in `KaiMarketPreviewView` | same JS service path in Capacitor runtime | No forced provider hit while cache fresh |
| Top-shell no-underlap contract | root scroll offset from `resolveTopShellMetrics` + CSS vars | same React runtime in Capacitor | Non-onboarding routes must start below masked top shell; no page-level overlap hacks |
| Bottom chrome behavior | navbar + command bar hide/reveal on scroll | same React runtime behavior | Route- and onboarding-state aware visibility gating |
| Onboarding chrome gating | route + cookie state helper | same logic in shared JS | command bar hidden during active onboarding/import flow |

## Explicit Web-Only Behavior

| Area | Why Web-Only | Native Fallback / Equivalent |
| --- | --- | --- |
| `HushhDatabase` plugin | IndexedDB-oriented web storage abstraction | Native uses vault/world-model APIs and platform storage plugins |
| Next.js API route files | App Router proxy layer exists only in web build | Native plugins call backend directly via shared service contract |

## Parity Verification Commands

```bash
cd hushh-webapp && npm run verify:parity
cd hushh-webapp && npm run verify:capacitor:routes
python scripts/ops/kai-system-audit.py --api-base http://localhost:8000 --web-base http://localhost:3000
```

## Failure Interpretation

- Route verification failure: app route files or legacy alias cleanup drift.
- Native parity failure: plugin registration/method contract drift across TS/iOS/Android.
- Runtime audit failure: route or token/access behavior mismatch not caught by static checks.
