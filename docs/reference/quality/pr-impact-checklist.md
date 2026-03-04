# PR Impact Checklist

Mandatory impact mapping for any change touching Kai, world model, routes, or mobile parity.

## Required PR Fields

- Routes touched
- API/schema/type changes
- Cache keys touched
- World-model domain summary effects
- Mobile parity impacts
- Docs updated (exact file list)
- Verification commands executed

## Fill-In Template

```md
### Impact Map

- Routes touched:
  - ...

- API/schema/type changes:
  - ...

- Cache keys touched:
  - ...

- World-model effects:
  - Domain(s): ...
  - Summary fields changed: ...
  - Reconciliation required: yes/no

- Mobile parity impacts:
  - Route parity: ...
  - Plugin/bridge contract: ...
  - Web-only behavior changes: ...

- Docs updated:
  - ...

- Verification run:
  - [ ] `npm run verify:routes`
  - [ ] `npm run verify:parity`
  - [ ] `npm run verify:capacitor:routes`
  - [ ] `npm run verify:cache`
  - [ ] `npm run verify:docs`
  - [ ] `python scripts/ops/kai-system-audit.py --api-base ... --web-base ...`
```

## Review Rules

- PR is not review-ready until all required fields are populated.
- “No impact” is allowed only with explicit statement per section.
- Missing verification entries are treated as launch-risk debt.
