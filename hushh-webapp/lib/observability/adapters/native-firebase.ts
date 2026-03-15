import { Capacitor } from "@capacitor/core";

import type {
  ObservabilityAdapter,
  ObservabilityEventName,
  PrimitiveEventValue,
} from "@/lib/observability/events";

type FirebaseAnalyticsModule = {
  logEvent: (options: {
    name: string;
    params?: Record<string, PrimitiveEventValue>;
  }) => Promise<void>;
};

let firebaseAnalyticsPromise: Promise<FirebaseAnalyticsModule | null> | null = null;

async function getFirebaseAnalyticsModule(): Promise<FirebaseAnalyticsModule | null> {
  if (firebaseAnalyticsPromise) return firebaseAnalyticsPromise;

  firebaseAnalyticsPromise = (async () => {
    try {
      const mod = await import("@capacitor-firebase/analytics");
      const candidate = mod.FirebaseAnalytics;

      if (candidate && typeof candidate.logEvent === "function") {
        return candidate;
      }
      return null;
    } catch {
      return null;
    }
  })();

  return firebaseAnalyticsPromise;
}

export const nativeFirebaseAdapter: ObservabilityAdapter = {
  name: "native-firebase",

  isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  },

  async track(
    eventName: ObservabilityEventName,
    payload: Record<string, PrimitiveEventValue>
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    const analytics = await getFirebaseAnalyticsModule();
    if (!analytics) return;

    await analytics.logEvent({
      name: eventName,
      params: payload,
    });
  },
};
