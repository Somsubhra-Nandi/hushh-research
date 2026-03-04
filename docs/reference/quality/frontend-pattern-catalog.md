# Frontend Pattern Catalog

## Pattern: Stock Primitive First
Use when you need baseline UI controls.

```tsx
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
```

## Pattern: Morphy CTA Extension
Use when an action needs upgraded CTA behavior (ripple, premium treatment).

```tsx
import { Button } from "@/lib/morphy-ux/button";

<Button variant="blue-gradient" effect="fill" showRipple>
  Continue
</Button>
```

## Pattern: Morphy Surface Extension
Use when a screen needs a premium interactive surface.

```tsx
import { Card, CardContent } from "@/lib/morphy-ux/card";

<Card variant="none" effect="glass" showRipple={false}>
  <CardContent className="p-4">...</CardContent>
</Card>
```

## Pattern: Tabs Base + Optional Morphy Wrapper
Use stock tabs for default behavior. Use Morphy tabs only when ripple/state-layer upgrades are intentional.

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
```

```tsx
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/lib/morphy-ux/ui/tabs";
```

## Pattern: Stock Chart Primitives
Use stock chart infrastructure for all chart surfaces.

```tsx
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
```

Rules:
1. Keep tooltip formatting inside `ChartTooltipContent` formatter/labelFormatter.
2. Keep chart files focused on data mapping and composition.
3. Avoid chart primitive forks outside `components/ui/chart.tsx`.

## Pattern: Moved App UI Components
Custom app components now live in `components/app-ui/*`.

```tsx
import { HushhLoader } from "@/components/app-ui/hushh-loader";
import { TopAppBar } from "@/components/app-ui/top-app-bar";
```

Do not use:
1. `@/components/ui/hushh-loader`
2. `@/components/ui/top-app-bar`
3. `@/components/ui/data-table`

## Pattern: Toast Usage
Use Morphy toast helper for app notifications.

```tsx
import { morphyToast } from "@/lib/morphy-ux/morphy";

morphyToast.success("Saved");
```

## Pattern: Icon Usage
Use Lucide through the icon wrapper for consistent sizing behavior.

```tsx
import { Shield } from "lucide-react";
import { Icon } from "@/lib/morphy-ux/ui";

<Icon icon={Shield} size="sm" className="text-primary" />;
```
