# Frontend Pattern Catalog (AI-Indexed)

Keywords: design-system, patterns, lucide, shadcn, radix, morphy, glass, radius, onboarding, kai

This document defines **copy-paste-safe** usage patterns for the Hushh frontend.
It is intended to be scanned by both humans and agents. Prefer these patterns over inventing new ones.

---

## Pattern: Lucide Icon (Standard)

Keywords: lucide, icon, size, stroke, 1px

Use when: You need an icon anywhere in app code (non-vendor).

Do:
- Use `Icon` wrapper.
- Use `size="xs|sm|md|lg|xl"` tokens or a numeric size for rare cases.
- Use `className` for color/margins/animation only.

Don't:
- Size icons via Tailwind `h-<n>/w-<n>` in app code.

```tsx
import { ShieldCheck } from "lucide-react";
import { Icon } from "@/lib/morphy-ux/ui";

<Icon icon={ShieldCheck} size="sm" className="text-primary" />;
```

---

## Pattern: Primary CTA Button (Morphy)

Keywords: button, cta, morphy, ripple, glass, gradient

Use when: A user-facing action is primary (continue, save, launch, approve).

Do:
- Import Morphy Button.
- Prefer `variant="blue-gradient"` for primary CTAs.
- Use `effect="fill"` for solid CTAs and `effect="glass"` for glass CTAs.

```tsx
import { Button } from "@/lib/morphy-ux/button";

<Button variant="blue-gradient" effect="fill" size="lg" fullWidth showRipple>
  Continue
</Button>;
```

---

## Pattern: Tertiary Button (Morphy, Ghost-Like)

Keywords: button, tertiary, ghost, icon-button, morphy, fade

Use when: The action is secondary/tertiary (collapse, menu trigger, close) and should not feel like a primary CTA.

Do:
- Use Morphy `Button` with `variant="none"` and `effect="fade"`.
- Disable ripple for purely structural controls (menus/collapse).

```tsx
import { X } from "lucide-react";
import { Button } from "@/lib/morphy-ux/button";
import { Icon } from "@/lib/morphy-ux/ui";

<Button
  variant="none"
  effect="fade"
  size="icon-sm"
  showRipple={false}
  className="h-8 w-8 p-0 border border-transparent hover:border-border/40"
>
  <Icon icon={X} size="sm" />
</Button>;
```

---

## Pattern: Glass Surface (Morphy Card + shadcn content)

Keywords: card, glass, surface, morphy, shadcn

Use when: A visible surface is part of the product UI (Kai, vault, onboarding, consents).

Do:
- Use Morphy `Card` for the surface.
- Use shadcn `CardContent/CardHeader/...` if you need sub-structure.

```tsx
import { Card } from "@/lib/morphy-ux/card";
import { CardContent } from "@/components/ui/card";

<Card variant="none" effect="glass" showRipple={false}>
  <CardContent className="p-4">...</CardContent>
</Card>;
```

Don't:
- Use legacy `.crystal-*` classes in app code.

---

## Pattern: shadcn Primitive With Morphy Footer CTA

Keywords: shadcn, sheet, dialog, footer, cta

Use when: Using shadcn primitives (`Sheet`, `Dialog`, `AlertDialog`, etc.) but the action is user-facing.

Do:
- Keep shadcn component stock.
- Use Morphy Button for action rows.

```tsx
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/lib/morphy-ux/button";

<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent>
    ...
    <Button variant="blue-gradient" effect="fill" size="lg" fullWidth>
      Save
    </Button>
  </SheetContent>
</Sheet>;
```

---

## Pattern: Carousel (Fixed Frame, Sliding Preview Only)

Keywords: onboarding, carousel, shadcn, embla, fixed footer

Use when: Marketing preview/onboarding step where only content slides and footer CTA stays fixed.

Do:
- Put header + dots + CTA outside `CarouselContent`.
- Only wrap preview area inside `Carousel`.
- CTA advances `api.scrollNext()` until last slide.

---

## Pattern: Onboarding Carousel Slide Content (Figma -> React)

Keywords: onboarding, carousel, preview, compact, morphy-card, lucide

Use when: Building onboarding slides from design references without raw HTML imports.

Do:
- Keep slide composition in React components under `components/onboarding/previews/*`.
- Use Morphy `Card` (`preset="hero"`) for glass surfaces.
- Use Lucide via `Icon` wrapper (no Material Symbols).
- Keep slide data (title/accent/subtitle/component) in `PreviewCarouselStep`.

Don't:
- Paste Figma HTML directly into routes/components.
- Re-implement slide-specific styles inline in app routes.

Files:
- `hushh-webapp/components/onboarding/PreviewCarouselStep.tsx`
- `hushh-webapp/components/onboarding/previews/KycPreviewCompact.tsx`
- `hushh-webapp/components/onboarding/previews/PortfolioPreviewCompact.tsx`
- `hushh-webapp/components/onboarding/previews/DecisionPreviewCompact.tsx`

---

## Pattern: Onboarding Auth Step (Providers + Disabled Phone)

Keywords: onboarding, auth, apple, google, phone-disabled, morphy-button

Use when: Building the pre-auth login step after onboarding marketing slides.

Do:
- Keep auth provider buttons centralized via `AuthProviderButton`.
- Keep phone login present but disabled until the flow is enabled.
- Reuse `BrandMark` and onboarding hero typography for consistency with intro.
- Keep provider wiring in `AuthStep` (Google/Apple/Reviewer handlers) and UI composition separate.

Files:
- `hushh-webapp/components/onboarding/AuthStep.tsx`
- `hushh-webapp/components/onboarding/AuthProviderButton.tsx`

---

## Pattern: Centralized Error Toast (Sonner)

Keywords: sonner, toast, error, feedback, morphy, notifications

Use when: You need to show an operation result/error and want consistent color + behavior across the app.

Do:
- Use `morphyToast.error|warning|info|success`.
- Keep error copy concise and include next-step descriptions when useful.
- Rely on centralized Sonner theme/tokens (`morphy-sonner-toast`).

Don't:
- Render large inline error banners on onboarding/auth pages for transient action failures.
- Add per-screen custom toast colors.

```tsx
import { morphyToast } from "@/lib/morphy-ux/morphy";

try {
  await action();
  morphyToast.success("Saved successfully");
} catch (error: any) {
  morphyToast.error(error?.message || "Save failed", {
    description: "Please retry in a moment.",
  });
}
```

---

## Pattern: Page Enter Fade (GSAP)

Keywords: gsap, motion, page, enter, fade, providers

Use when: You want a route/page to fade in seamlessly on mount or on pathname change.

Do:
- Use `usePageEnterAnimation` on a single container ref.
- Trigger on pathname via `key` (or a key-based remount).

Don't:
- Add bespoke `ease-[cubic-bezier(...)]` + `duration-500` on page wrappers.

```tsx
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { usePageEnterAnimation } from "@/lib/morphy-ux/hooks/use-page-enter";

const pathname = usePathname();
const ref = useRef<HTMLDivElement | null>(null);
usePageEnterAnimation(ref, { enabled: true, key: pathname });

return <div ref={ref}>{children}</div>;
```

---

## Pattern: Loader -> Content Fade (GSAP)

Keywords: gsap, motion, loader, fade, async, ready

Use when: A view shows a loader/skeleton, then renders real content after async.

Do:
- Animate only the content container (opacity/y).
- Reset when `ready` goes false so reopening a sheet can replay.

```tsx
import { useRef } from "react";
import { useFadeInOnReady } from "@/lib/morphy-ux/hooks/use-fade-in-on-ready";

const ref = useRef<HTMLDivElement | null>(null);
useFadeInOnReady(ref, ready, { fromY: 10 });

return <div ref={ref}>{ready ? <Content /> : <Loader />}</div>;
```

---

## Pattern: Carousel Deck Focus (GSAP)

Keywords: gsap, carousel, deck, scale, stack, embla

Use when: Carousel should feel like a “card stack” where the focused slide pops.

Do:
- Store refs for slide inner wrappers.
- Use `useCarouselDeckFocus` to animate scale/opacity/y with global deck tokens.

```tsx
import { useRef } from "react";
import { useCarouselDeckFocus } from "@/lib/morphy-ux/hooks/use-carousel-deck-focus";

const slideEls = useRef<Array<HTMLElement | null>>([]);
useCarouselDeckFocus({ activeIndex, slideEls });

<div ref={(n) => (slideEls.current[idx] = n)}>...</div>;
```

---

## Pattern: Feature Rail Trail Reveal (GSAP)

Keywords: onboarding, feature-rail, icon-chip, gsap, trail, stagger

Use when: The intro screen needs a top-to-bottom guide rail that activates feature chips in sequence.

Do:
- Use `OnboardingFeatureList` for layout and `useFeatureRailTrail` for animation.
- Keep chip tones token-based (`--tone-*` vars in globals).
- Respect reduced motion (hook auto no-ops and applies final active state).

Don't:
- Build raw HTML rails in app routes.
- Animate with ad-hoc Tailwind transitions for this pattern.

```tsx
import { Zap, TrendingUp, CandlestickChart } from "lucide-react";
import { OnboardingFeatureList } from "@/lib/morphy-ux/ui";

<OnboardingFeatureList
  features={[
    { tone: "blue", icon: Zap, title: "Seamless KYC", subtitle: "..." },
    { tone: "green", icon: TrendingUp, title: "Portfolio Monitoring", subtitle: "..." },
    { tone: "orange", icon: CandlestickChart, title: "Actionable Advice", subtitle: "..." },
  ]}
/>;
```

---

## Pattern: Kai Dashboard Master Composition

Keywords: kai, dashboard, portfolio, cards, master-view

Use when: Building or extending `/kai/dashboard`.

Do:
- Compose dashboard through `DashboardMasterView`.
- Keep totals/allocation/holding rows in dedicated card components.
- Reuse existing handler props from `KaiFlow` (`onManagePortfolio`, `onAnalyzeStock`, `onAnalyzeLosers`).

Don't:
- Add direct API mutation logic inside dashboard cards.
- Fork another dashboard surface without route-gated rollout reason.

---

## Pattern: Vault Method Prompt + Profile Settings

Keywords: vault, passphrase, biometric, passkey, rewrap, single-kek

Use when: Offering unlock method upgrades or method switching.

Do:
- Use `VaultMethodService.switchMethod(...)` as the single method-switch entrypoint.
- Keep single-active-KEK semantics (rewrap same vault key, do not generate a new vault key).
- Reuse same capability and method state model in both modal prompt and profile page.

Don't:
- Add alternative direct `setupVault` calls in UI layers for method switching.
- Add plaintext fallback branches.

---

## Pattern: `/kai` Bottom Nav Guided Tour

Keywords: kai, nav-tour, onboarding, cross-device, kai-profile

Use when: First-time education for bottom navigation tabs on `/kai`.

Do:
- Render tour only on `/kai`.
- Persist local pending state via `KaiNavTourLocalService`.
- Sync to `kai_profile` (`nav_tour_completed_at`, `nav_tour_skipped_at`) when vault context is available.

Don't:
- Show tour on onboarding/import routes.
- Compete with other first-time prompts on the same route and frame.

---

## Pattern: Radius Tokens (Globally Tunable)

Keywords: radius, rounded, tokens

Use when: Choosing rounding.

Do:
- Controls: `rounded-md` / `rounded-sm`
- Surfaces: `rounded-lg` / `rounded-xl`
- Hero: `rounded-2xl` / `rounded-3xl`
- Pills: `rounded-full`

Don't:
- Introduce custom `rounded-[...]` unless it’s a deliberate exception.
