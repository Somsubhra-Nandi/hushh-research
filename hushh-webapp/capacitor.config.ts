import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import type { CapacitorConfig } from "@capacitor/cli";

// For development: set to true to use localhost:3000 hot reload
// For production: set to false to use static build in /out
const DEV_MODE = process.env.CAPACITOR_DEV === "true";

// When CAPACITOR_DEV=true, point the native WebView at a running Next.js dev server.
// IMPORTANT: This does NOT change native plugin networking.
// Native plugins must always hit the Python backend via BACKEND_URL for parity.
// Android emulator cannot reach host localhost; use 10.0.2.2.
const DEFAULT_DEV_APP_URL =
  process.env.CAPACITOR_PLATFORM === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (DEV_MODE ? DEFAULT_DEV_APP_URL : undefined);

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://consent-protocol-1006304528804.us-central1.run.app";

const NORMALIZED_BACKEND_URL = (() => {
  if (process.env.CAPACITOR_PLATFORM !== "android") return BACKEND_URL;
  // Android emulator cannot reach host loopback; use 10.0.2.2
  if (BACKEND_URL.includes("localhost")) return BACKEND_URL.replace("localhost", "10.0.2.2");
  if (BACKEND_URL.includes("127.0.0.1")) return BACKEND_URL.replace("127.0.0.1", "10.0.2.2");
  return BACKEND_URL;
})();

const config: CapacitorConfig = {
  appId: "com.hushh.app",
  appName: "Kai",
  webDir: "out",

  // iOS-specific configuration
  ios: {
    contentInset: "always", // "always" for stable layout (prevents bounce)
    allowsLinkPreview: true,
    scrollEnabled: true,
    backgroundColor: "#0a0a0a",
    scheme: "App",
  },

  // Server configuration
  server: {
    // DEV: Use live server for hot reload
    // PROD: Uses static export from webDir
    url: APP_URL,
    cleartext: true, // Allow HTTP for localhost
    androidScheme: "https",
    iosScheme: "App",
  },

  plugins: {
    FirebaseAuthentication: {
      // Use native Google Sign-In SDK on iOS/Android
      skipNativeAuth: false,
      providers: ["google.com"],
    },
    HushhVault: {
      backendUrl: NORMALIZED_BACKEND_URL,
    },
    HushhConsent: {
      backendUrl: NORMALIZED_BACKEND_URL,
    },
    Kai: {
      backendUrl: NORMALIZED_BACKEND_URL,
    },
    HushhNotifications: {
      backendUrl: NORMALIZED_BACKEND_URL,
    },
    WorldModel: {
      backendUrl: NORMALIZED_BACKEND_URL,
    },
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      overlaysWebView: true, // transparent status bar; blur strip in app
      style: "DARK",
      backgroundColor: "#00000000",
    },
  },
};

export default config;
