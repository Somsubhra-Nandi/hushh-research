# RIA Verification Policy

## Purpose

Define activation gate rules for advisor actors before investor private-data requests are allowed.

## State Machine

1. `draft`
2. `submitted`
3. `finra_verified`
4. `active`
5. `rejected`

## Gate Rules

1. `draft` and `submitted` cannot create investor-data access requests.
2. `finra_verified` and `active` can create investor-data access requests.
3. `rejected` must resubmit and pass verification.
4. Outage or upstream verification failure keeps actor in non-active state (fail-closed).
5. Manual bypass is not enabled in current runtime.

## Verification Data Contract

1. `advisor_legal_name`
2. `crd_number`
3. `sec_registration_id`
4. `verification_source`
5. `verification_checked_at`
6. `verification_expires_at`
7. `verification_status`

## Freshness Policy

1. Cache successful verification responses with TTL.
2. Re-verify on key identity edits (firm, CRD, jurisdiction).
3. Re-verify after TTL expiry.
