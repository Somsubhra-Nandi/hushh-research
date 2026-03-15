"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function KaiMockSonnerNotice() {
  const router = useRouter();

  useEffect(() => {
    toast.info("Kai home is an exploratory mock surface.", {
      id: "kai-mock-home-notice",
      description: "Use Portfolio for live, data-bound insights and actions.",
      action: {
        label: "Go to Portfolio",
        onClick: () => router.push("/kai/portfolio"),
      },
      duration: 7000,
    });
  }, [router]);

  return null;
}
