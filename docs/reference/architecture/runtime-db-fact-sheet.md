# Runtime DB Fact Sheet (Sanitized)

This appendix records a read-only schema snapshot of the runtime Postgres database used in local development. It is documentation-only and intentionally excludes credentials, row payloads, and any user-secret values.

- Captured at (UTC): `2026-03-02T03:52:45Z`
- Source: read-only introspection using local `consent-protocol/.env` connectivity
- Schema: `public`

## Public Tables (13)

1. `consent_audit`
2. `consent_exports`
3. `domain_registry`
4. `kai_market_cache_entries`
5. `renaissance_avoid`
6. `renaissance_screening_criteria`
7. `renaissance_universe`
8. `tickers`
9. `user_push_tokens`
10. `vault_key_wrappers`
11. `vault_keys`
12. `world_model_data`
13. `world_model_index_v2`

## Key Column Snapshots

### `world_model_data`

- `user_id` (`text`)
- `encrypted_data_ciphertext` (`text`)
- `encrypted_data_iv` (`text`)
- `encrypted_data_tag` (`text`)
- `algorithm` (`text`)
- `data_version` (`integer`)
- `created_at` (`timestamp with time zone`)
- `updated_at` (`timestamp with time zone`)

### `world_model_index_v2`

- `user_id` (`text`)
- `domain_summaries` (`jsonb`)
- `available_domains` (`ARRAY`)
- `computed_tags` (`ARRAY`)
- `activity_score` (`numeric`)
- `last_active_at` (`timestamp with time zone`)
- `total_attributes` (`integer`)
- `model_version` (`integer`)
- `created_at` (`timestamp with time zone`)
- `updated_at` (`timestamp with time zone`)

### `vault_keys`

- `user_id` (`text`)
- `vault_key_hash` (`text`)
- `primary_method` (`text`)
- `recovery_encrypted_vault_key` (`text`)
- `recovery_salt` (`text`)
- `recovery_iv` (`text`)
- `created_at` (`bigint`)
- `updated_at` (`bigint`)
- `primary_wrapper_id` (`text`)
- `vault_status` (`text`)
- `first_login_at` (`bigint`)
- `last_login_at` (`bigint`)
- `login_count` (`integer`)
- `pre_onboarding_completed` (`boolean`)
- `pre_onboarding_skipped` (`boolean`)
- `pre_onboarding_completed_at` (`bigint`)
- `pre_nav_tour_completed_at` (`bigint`)
- `pre_nav_tour_skipped_at` (`bigint`)
- `pre_state_updated_at` (`bigint`)

## Core Application Functions Observed

The `public` schema also includes extension/operator functions (vector/trigram) that are omitted here for readability. Core app-facing functions observed:

1. `consent_audit_notify()`
2. `get_user_world_model_metadata(p_user_id text)`
3. `update_world_model_data_timestamp()`
4. `merge_domain_summary(p_user_id text, p_domain text, p_summary jsonb)` (optional accelerator path)
5. `remove_domain_summary_key(p_user_id text, p_domain text, p_key text)` (optional accelerator path)

## Reproducibility

Use a read-only introspection query set against `information_schema`, `pg_catalog.pg_tables`, and `pg_proc` to refresh this file. Do not include credentials or data rows in documentation artifacts.
