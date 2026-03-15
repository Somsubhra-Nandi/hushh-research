# Hushh Documentation

> Canonical entry point for repo-level documentation.

Hushh is a Personal Agent platform built on four operational invariants:

1. BYOK: server stores ciphertext only.
2. Consent-first: every data access path is consent-gated.
3. Tri-flow: web, iOS, and Android stay contract-aligned.
4. Minimal browser storage: sensitive credentials remain in memory.

For repo setup, see [`readme.md`](../readme.md) and [`getting_started.md`](../getting_started.md).

## I Want To...

| Goal | Document |
| ---- | -------- |
| Understand architecture and endpoint surface | [reference/architecture/architecture.md](./reference/architecture/architecture.md) |
| See all API contracts | [reference/architecture/api-contracts.md](./reference/architecture/api-contracts.md) |
| Understand route governance | [reference/architecture/route-contracts.md](./reference/architecture/route-contracts.md) |
| Check DB/runtime fact sheet | [reference/architecture/runtime-db-fact-sheet.md](./reference/architecture/runtime-db-fact-sheet.md) |
| Review CI and delivery gates | [reference/operations/ci.md](./reference/operations/ci.md) |
| Review env + secrets contract | [reference/operations/env-and-secrets.md](./reference/operations/env-and-secrets.md) |
| Operate observability | [reference/operations/observability-google-first.md](./reference/operations/observability-google-first.md) |
| Operate production DB backup/recovery | [reference/operations/production-db-backup-and-recovery.md](./reference/operations/production-db-backup-and-recovery.md) |
| Review cloud + on-device AI future plan | [reference/ai/on-device-future-plan/README.md](./reference/ai/on-device-future-plan/README.md) |
| Review Investor + RIA IAM architecture and policy | [reference/iam/README.md](./reference/iam/README.md) |
| Follow docs governance and naming rules | [reference/operations/docs-governance.md](./reference/operations/docs-governance.md) |
| Understand Kai runtime dependencies | [reference/kai/kai-interconnection-map.md](./reference/kai/kai-interconnection-map.md) |
| Understand Kai brokerage connectivity and execution boundary | [reference/kai/kai-brokerage-connectivity-architecture.md](./reference/kai/kai-brokerage-connectivity-architecture.md) |
| Run Kai impact/risk checks | [reference/kai/kai-change-impact-matrix.md](./reference/kai/kai-change-impact-matrix.md) |
| Implement/verify streaming contracts | [reference/streaming/streaming-contract.md](./reference/streaming/streaming-contract.md) |
| Follow design system rules | [reference/quality/design-system.md](./reference/quality/design-system.md) |
| Validate PR impact checklist | [reference/quality/pr-impact-checklist.md](./reference/quality/pr-impact-checklist.md) |
| Get started quickly | [guides/getting-started.md](./guides/getting-started.md) |
| Activate and test Plaid end to end | [guides/plaid-activation-and-testing.md](./guides/plaid-activation-and-testing.md) |
| Build mobile/native | [guides/mobile.md](./guides/mobile.md) |
| Review planned broker execution architecture | [vision/kai/broker-execution-future-state.md](./vision/kai/broker-execution-future-state.md) |
| Read backend-specific docs | [consent-protocol/docs/README.md](../consent-protocol/docs/README.md) |
| Read frontend/native docs | [hushh-webapp/docs/README.md](../hushh-webapp/docs/README.md) |

## Documentation Homes

| Location | Scope | Entry Point |
| -------- | ----- | ----------- |
| `docs/` | Cross-cutting architecture, operations, quality, product references | [README.md](./README.md) |
| `consent-protocol/docs/` | Backend implementation and protocol references | [README.md](../consent-protocol/docs/README.md) |
| `hushh-webapp/docs/` | Frontend/native implementation references | [README.md](../hushh-webapp/docs/README.md) |

## Directory Layout

```text
docs/
  README.md
  project_context_map.md
  guides/
  reference/
    ai/
      on-device-future-plan/
    architecture/
    iam/
    kai/
    operations/
    quality/
    streaming/
  vision/
```

Use kebab-case for non-index docs and keep only durable references in this tree.
