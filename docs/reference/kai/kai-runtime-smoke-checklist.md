# Kai Runtime Smoke Checklist

Use this lightweight checklist instead of expanding automated test coverage.

## 0) Route/System Audit
1. Run:
   - `python scripts/ops/kai-system-audit.py --api-base http://localhost:8000 --web-base http://localhost:3000`
2. Confirm output files:
   - `temp/kai-system-audit-<timestamp>.json`
   - `temp/kai-system-audit-<timestamp>.md`
3. Verify required Kai API routes/methods are present in OpenAPI.
4. Verify frontend route probes pass for:
   - `/kai/import`
   - `/kai`
   - `/kai/dashboard`
   - `/kai/dashboard/analysis`
   - `/kai/dashboard/portfolio-health`

## 1) Fresh User Import Flow
1. Sign in with a user that has no `financial` domain.
2. Start onboarding/import, upload a brokerage PDF.
3. Confirm stage timeline streams and holdings preview increments.
4. Confirm no stream reset when vault is created/unlocked mid-import.

## 2) World Model Integrity
1. Run:
   - `node scripts/ops/audit-world-model-user.mjs --userId <uid> --passphrase '<passphrase>'`
2. Verify output files:
   - `temp/world-model-audit-<uid>.json`
   - `temp/world-model-audit-<uid>.md`
3. Confirm:
   - blob domains align with index/registry,
   - `financial` canonical summary count is non-zero when holdings exist,
   - debate context readiness is `true`.

## 3) /kai Cache + UX
1. Open `/kai` and note initial load time.
2. Navigate away and back within 60s.
3. Confirm no unnecessary full re-fetch (screen should be fast and stable).
4. Confirm hero reads as holdings-led context and buttons have expected styles:
   - `Open Dashboard` blue gradient fill
   - `Refresh` fade style

## 4) Debate Output Reliability
1. Run stock analysis from dashboard/portfolio flow.
2. Confirm quick recommendation card appears with final decision.
3. Confirm decision card world-model context shows non-zero holdings count when applicable.
4. If providers degrade, confirm degraded messaging appears without hard failure.

## 5) Toast Readability
1. Trigger success/warning/error toasts over rich backgrounds.
2. Confirm glass blur/contrast keeps text legible and visually separated from content.

## 6) Mobile Parity Sanity
1. Run:
   - `cd hushh-webapp && npm run verify:parity`
   - `cd hushh-webapp && npm run verify:capacitor:routes`
2. Confirm canonical Kai routes exist in mobile static export mapping.
3. Confirm stream, token guard, and cache-first behavior match web expectations.

## 7) Web-Only Behavior Validation
1. Confirm web-only plugins/features remain explicitly documented.
2. Confirm no UI/route dependency assumes native-only plugin behavior on web.
