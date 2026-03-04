# Production DB Backup and Recovery (Supabase)

This is the durable runbook for production database recovery readiness.

Scope:
- Production remains on Supabase.
- Backup strategy is Supabase-native (no offsite copy in this phase).
- App behavior remains unchanged; controls are operational/CI-only.

---

## Recovery Profile (Balanced)

- RPO target: `<= 15 minutes`
- RTO target: `<= 2 hours`
- Retention target: `35 days` (or plan maximum; document effective cap if lower)

---

## Enforced Controls

1. Pre-deploy backup gate in production deployment workflow:
- checks backup freshness (`<24h`)
- checks PITR readiness (`restore-point` endpoint)
- creates a pre-deploy restore point

2. Migration governance gate before production backend deploy:
- enforces monotonic numbered migration files in `consent-protocol/db/migrations`
- enforces contract version alignment with `consent-protocol/db/schema_contract/prod_core_schema.json`
- runs read-only live schema drift checks for production-critical tables/columns

3. Release evidence artifact:
- generates `prod_migration_release_manifest.json`
- records git SHA, operator, migration files/hash, backup gate linkage, restore-point identifier

4. Daily backup posture scheduled workflow:
- `.github/workflows/prod-supabase-backup-posture.yml`
- fails on policy breach; uploads a JSON posture report artifact

---

## Required GitHub Secrets (Ops)

- `SUPABASE_PROJECT_REF_PROD`
- `SUPABASE_MANAGEMENT_TOKEN`

These are used by:
- `scripts/ops/supabase_backup_posture_check.py`
- production deploy pre-gate (`.github/workflows/deploy-production.yml`)
- daily posture workflow (`.github/workflows/prod-supabase-backup-posture.yml`)

---

## Local Verification Commands

Backup posture (read-only):

```bash
python3 scripts/ops/supabase_backup_posture_check.py \
  --project-ref "$SUPABASE_PROJECT_REF_PROD" \
  --management-token "$SUPABASE_MANAGEMENT_TOKEN" \
  --require-pitr \
  --max-backup-age-hours 24
```

Migration guard (read-only):

```bash
python3 scripts/ops/db_migration_release_guard.py \
  --report-path /tmp/db-migration-guard-report.json
```

Pre-deploy restore-point creation:

```bash
python3 scripts/ops/supabase_backup_posture_check.py \
  --project-ref "$SUPABASE_PROJECT_REF_PROD" \
  --management-token "$SUPABASE_MANAGEMENT_TOKEN" \
  --require-pitr \
  --max-backup-age-hours 24 \
  --create-restore-point \
  --restore-point-label "predeploy-$(git rev-parse --short HEAD)"
```

Generate release manifest:

```bash
python3 scripts/ops/generate_migration_release_manifest.py \
  --output /tmp/prod-migration-release-manifest.json \
  --environment production \
  --backup-report-path /tmp/backup-posture-report.json
```

---

## Restore Drill Cadence

Weekly integrity verification:
- confirm backup list is fresh and PITR endpoint is reachable
- confirm restore-point creation permission works

Monthly restore drill:
1. Restore to isolated non-prod Supabase project.
2. Run sanity checks:
- key table counts (`consent_audit`, `vault_keys`, `world_model_data`, `world_model_index_v2`, `kai_market_cache_entries`, `tickers`)
- coherence checks (world-model data/index integrity)
3. Record:
- drill start/end time
- observed restore duration (RTO)
- pass/fail + remediation tasks

---

## References

- Supabase Backups & PITR: https://supabase.com/docs/guides/platform/backups
- Supabase backup schedule: https://supabase.com/docs/guides/platform/backups#backup-schedule
- Supabase restore/PITR: https://supabase.com/docs/guides/platform/backups#point-in-time-recovery
