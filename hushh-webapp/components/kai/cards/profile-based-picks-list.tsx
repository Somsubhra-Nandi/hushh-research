"use client";

import { Plus } from "lucide-react";

import { Button } from "@/lib/morphy-ux/button";
import { Card, CardContent } from "@/lib/morphy-ux/card";
import { Icon } from "@/lib/morphy-ux/ui";

type Pick = {
  symbol: string;
  company: string;
  category: string;
};

const DEFAULT_PICKS: Pick[] = [
  { symbol: "JNJ", company: "Johnson & Johnson", category: "Consumer Health" },
  { symbol: "PG", company: "Procter & Gamble", category: "Consumer Goods" },
  { symbol: "PEP", company: "PepsiCo Inc.", category: "Beverages" },
];

interface ProfileBasedPicksListProps {
  onAdd: (symbol: string) => void;
}

export function ProfileBasedPicksList({ onAdd }: ProfileBasedPicksListProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-black">Based on your profile</h3>
        <p className="text-xs font-medium text-muted-foreground">Curated for steady, balanced growth.</p>
      </div>

      <div className="space-y-2">
        {DEFAULT_PICKS.map((pick) => (
          <Card key={pick.symbol} variant="none" effect="glass" className="rounded-2xl p-0" showRipple>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-muted text-xs font-black">
                  {pick.symbol}
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">{pick.company}</p>
                  <p className="text-xs font-medium text-muted-foreground">{pick.category}</p>
                </div>
              </div>

              <Button
                variant="none"
                effect="fade"
                size="icon-sm"
                aria-label={`Add ${pick.symbol}`}
                onClick={() => onAdd(pick.symbol)}
              >
                <Icon icon={Plus} size="sm" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
