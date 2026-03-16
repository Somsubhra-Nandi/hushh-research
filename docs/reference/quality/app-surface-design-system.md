# App Surface Design System

This document is the canonical contract for app-facing surfaces across Kai, RIA, Marketplace, Consent, and Profile.

Profile remains the reference implementation for settings rows. This document expands that language into the broader page-shell, header, and content-surface system.

## Shell Contract

1. The top shell is the single authority for header clearance.
2. Standard routes must reserve top space through `--top-shell-reserved-height`, not raw `env(safe-area-inset-top)`.
3. Standard page roots own their own start spacing through `padding-top: var(--page-top-start)`.
4. Do not solve overlap by adding bottom padding to the fixed top bar or by inserting route-local spacer nodes above page content.
5. Shared page-shell wrappers such as `RiaPageShell` and consent/profile/Kai route roots must apply the same page-start token.
6. Raw safe-area math is allowed only for true fullscreen or overlay surfaces that do not participate in the normal shell.
7. Native iOS stays aligned with:
   - `ios.contentInset = "never"`
   - `SystemBars.insetsHandling = "css"`
8. Decorative glass fade is visual-only and must never add extra content spacing.

## Page Header Contract

Use `PageHeader` and `SectionHeader` for all top-level and section-level headings.

Rules:

1. The icon sits on the left and is centered against the full header block:
   - eyebrow
   - title
   - description
2. The icon well should feel sized for the full three-line unit, not only the title line.
3. Titles and descriptions stay compact and readable on mobile first.
4. Do not stack a second decorative icon inside the same header block.
5. If a section already has a header icon, omit redundant per-row decorative icons unless the row needs them for real semantic distinction.

## Row and Card Interaction Contract

Rules:

1. If a row or card is actionable, the entire surface owns hover, press, and ripple.
2. Inner text blocks must not create a second hover state.
3. The trailing slot stays pinned right unless the design explicitly calls for a stacked mobile layout.
4. Use one interaction layer per surface.
5. `SettingsRow` is the default interactive list row contract and should be reused outside Profile when the surface is row-like.
6. Standalone actions should use the shared `Button` primitive so ripple, loading, and emphasis stay consistent across the app.
7. Do not ship raw clickable pills or text links for primary app actions when a shared button or row primitive already exists.

## Icon Policy

Rules:

1. Use Lucide icons with meaning-first selection.
2. Choose icons for what they depict, not for a vague use case:
   - use `Target`, `BarChart3`, `Building2`, `Newspaper`, `UserRound`, `Shield`, `Wallet`, etc. when they describe the surface directly
   - do not use generic `Sparkles` as a fallback for AI, optimize, onboarding, or premium semantics
3. For static app surfaces, import icons directly from `lucide-react` so tree-shaking keeps bundles tight. Do not use dynamic icon loading for normal page chrome.
4. Icon emphasis must match text emphasis in active and highlighted states.
5. Prefer relative icons that describe the section or action directly.
6. When building custom icon wells or icon-bearing surfaces, preserve Lucide’s visual assumptions:
   - 2px stroke language
   - visually centered composition
   - similar optical weight across sibling headers and actions
7. Refer to:
   - `https://lucide.dev/guide/packages/lucide-react`
   - `https://lucide.dev/guide/design/icon-design-guide`

## Market-Specific Rules

1. `RIA’s picks` uses compact list rows, not oversized cards.
2. News rows do not get a second per-row news icon when the section header already carries that meaning.
3. Market overview should only promote metrics backed by providers that are actually configured in the active environment.
4. Degraded or delayed states should read as intentional status, not as broken empty cards.
5. Long browse lists must support client-side pagination or equivalent browse controls once the result set stops being comfortably scannable in one pass.

## RIA Information Architecture

1. `RIA` is a lightweight workspace shell, not a second dense operations dashboard.
2. The RIA bottom navigation is `Home / Clients / Picks / Profile`.
3. `/consents` is the single consent/request workspace for both investor and RIA personas.
4. `/ria/requests` remains only as a compatibility alias into `/consents`, not as a second consent system.
5. Relationship views should stay grouped around:
   - relationship state
   - next action
   - available scope metadata
   - current grants
6. Workspace data views should open only after consent is active; pre-consent relationship surfaces stay metadata-only.

## Documentation References

1. `docs/reference/quality/design-system.md`
2. `docs/reference/quality/profile-settings-design-system.md`
3. `docs/reference/quality/app-surface-audit-matrix.md`
