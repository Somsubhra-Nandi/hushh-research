"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { HushhLoader } from "@/components/app-ui/hushh-loader";
import { useAuth } from "@/lib/firebase/auth-context";
import { OnboardingLocalService } from "@/lib/services/onboarding-local-service";
import { isOnboardingFlowActiveCookieEnabled } from "@/lib/services/onboarding-route-cookie";
import { IntroStep } from "@/components/onboarding/IntroStep";
import { PreviewCarouselStep } from "@/components/onboarding/PreviewCarouselStep";
import { ROUTES } from "@/lib/navigation/routes";
import { resolveAppEnvironment } from "@/lib/app-env";

type HomeStep = "intro" | "preview";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "";

  const { user, loading } = useAuth();
  const [step, setStep] = useState<HomeStep | null>(null);

  const forceOnboardingInDev = resolveAppEnvironment() === "development";

  // Debug helper (browser console): resets Steps 1-2 visibility flag.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;
     
    (window as any).resetOnboardingMarketing = async () => {
      await OnboardingLocalService.clearMarketingSeen();
      window.location.href = "/";
    };

    return () => {
       
      delete (window as any).resetOnboardingMarketing;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (loading) return;

    if (user) {
      const nextPath = isOnboardingFlowActiveCookieEnabled()
        ? ROUTES.KAI_IMPORT
        : ROUTES.KAI_HOME;
      router.push(nextPath);
      return;
    }

    (async () => {
      if (forceOnboardingInDev) {
        setStep("intro");
        return;
      }

      const shouldForceIntro = await OnboardingLocalService.consumeForceIntroOnce();
      if (shouldForceIntro) {
        setStep("intro");
        return;
      }

      const hasSeen = await OnboardingLocalService.hasSeenMarketing();
      if (cancelled) return;
      setStep(hasSeen ? "preview" : "intro");
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, router, forceOnboardingInDev]);

  if (loading || step === null) {
    return <HushhLoader label="Loading..." variant="fullscreen" />;
  }

  if (step === "intro") {
    return <IntroStep onNext={() => setStep("preview")} />;
  }

  if (step === "preview") {
    const loginUrl = redirectPath
      ? `${ROUTES.LOGIN}?redirect=${encodeURIComponent(redirectPath)}`
      : ROUTES.LOGIN;
    return <PreviewCarouselStep onContinue={() => router.push(loginUrl)} />;
  }
  return null;
}

export default function Home() {
  return (
    <Suspense fallback={<HushhLoader label="Loading..." variant="fullscreen" />}>
      <HomeContent />
    </Suspense>
  );
}
