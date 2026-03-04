# World Model Compatibility Playbook

Operational rules for evolving dynamic world-model domains safely without breaking Kai features.

## Canonical Domain Summary Contract

Every domain summary must follow canonical count compatibility:

- `attribute_count`: authoritative canonical count
- `item_count`: mirror for compatibility consumers
- `holdings_count`: mirror for financial/portfolio-like domains
- `portfolio_total_value`: optional aggregated scalar for UI (sanitized replacement for stripped `total_value`)

Consumer read order:
1. `attribute_count`
2. `holdings_count`
3. `item_count`

## Sanitization Rules (Non-Negotiable)

Never persist sensitive payload objects in index summaries:
- remove `holdings`
- remove raw `total_value` key (map numeric to `portfolio_total_value`)
- remove `vault_key`
- remove `password`

## Registry / Index / Blob Reconciliation

### Required Invariants

1. Domain present in encrypted blob must exist in `world_model_index_v2.available_domains`.
2. Every summary key in `domain_summaries` must be in `available_domains`.
3. Every active domain should exist in `domain_registry`.
4. `total_attributes` must be recomputed from canonical counts.

### Operational Commands

- User audit:
```bash
node scripts/ops/audit-world-model-user.mjs --userId <uid> --passphrase '<passphrase>'
```

- Financial cleanup/reconcile (supports dry-run):
```bash
python scripts/ops/reconcile_financial_domain.py --user-id <uid> --passphrase '<passphrase>'
```

- System route/runtime audit:
```bash
python scripts/ops/kai-system-audit.py --api-base http://localhost:8000 --web-base http://localhost:3000
```

## Symbol Normalization Trust Tiers

Normalized holding symbols should carry trust metadata:

- `tradable_ticker`: symbol master match, tradable
- `cash_equivalent`: normalized cash/sweep identifiers (`CASH`, former sweep ids)
- `non_tradable_identifier`: recognized but not tradable in market fan-out
- `unknown`: unresolved symbol, should be excluded from tradable watchlist fan-out

Trade-action tokens are never valid holdings symbols and must be dropped:
- `BUY`, `SELL`, `REINVEST`, `DIVIDEND`, `TRANSFER`, etc.

## Provenance and Confidence Propagation

Data must preserve provenance path:

1. Import parser emits `confidence`, `provenance`, dropped reasons.
2. Aggregated holdings retain lineage (`aggregated_from_lots` / lot counts).
3. Dashboard and market surfaces consume validated holdings only.
4. Debate payloads expose degraded metadata when context is partial.

## Migration-Safe Rules

- Additive fields only for active contracts unless a version bump is formally scheduled.
- Never remove legacy compatibility keys in same release as introducing new keys.
- For DB schema additions (e.g., ticker enrichment columns), keep runtime fallback paths until migration is guaranteed complete.
- Prefer read-compat shims over write-unsafe shortcuts.

## Release Compatibility Checklist

- [ ] Summary contract unchanged or additive-only
- [ ] Reconciliation scripts green on target users
- [ ] World-model audit shows zero mismatches
- [ ] Debate context counts non-zero when financial domain exists
- [ ] Cache keys and invalidation paths documented and verified
