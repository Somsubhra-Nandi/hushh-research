# Component Development Guidelines

## Quick Rules
1. `components/ui/*` is registry-owned stock shadcn only.
2. Put app-specific reusable components in `components/app-ui/*` or feature folders.
3. Use stock primitives by default.
4. Use Morphy wrappers only for explicit extension value (CTA upgrades, premium surfaces, tabs enhancement).
5. Keep chart primitives stock via `components/ui/chart.tsx`.
6. Never add custom files to `components/ui`.

## Folder Ownership
| Folder | Purpose |
|---|---|
| `components/ui/*` | Stock shadcn primitives; overwrite-safe vendor layer |
| `lib/morphy-ux/*` | Morphy extension internals and wrappers |
| `components/app-ui/*` | Reusable app-specific components |
| `components/<feature>/*` | Feature-level composition |

## Data Access Rule
Components do not call backend APIs directly.

Do:
1. Route network work through service modules in `lib/services/*`.
2. Keep platform differences in the service layer.

Do not:
1. Use raw `fetch()` in feature components for app API contracts.

## Component Selection
Use stock by default:

```tsx
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
```

Use Morphy extension when required:

```tsx
import { Button } from "@/lib/morphy-ux/button";
import { Card } from "@/lib/morphy-ux/card";
```

Use moved app components from `components/app-ui`:

```tsx
import { HushhLoader } from "@/components/app-ui/hushh-loader";
import { TopAppBar } from "@/components/app-ui/top-app-bar";
```

## Verification Commands
Run from `hushh-webapp`:

```bash
npm run verify:design-system
npm run verify:cache
npm run typecheck
npm run lint
```

## References
1. `docs/reference/quality/design-system.md`
2. `docs/reference/quality/frontend-pattern-catalog.md`
3. `docs/reference/architecture/cache-coherence.md`
