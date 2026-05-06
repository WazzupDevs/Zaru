import type { ExpoConfig } from "expo/config";

// Expo SDK 52 uses runtime app.config.ts; values here feed both
// `expo start` (dev) and `eas build` (A4g — not yet wired). Anything that
// must be reachable from JS at runtime goes under `extra` and is read
// via expo-constants. EXPO_PUBLIC_* env vars are also auto-injected
// into the JS bundle by Metro at build time.

const config: ExpoConfig = {
  name: "Event Fleet",
  slug: "event-fleet-customer",
  scheme: "eventfleet",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.eventfleet.app",
    supportsTablet: false,
  },
  android: {
    package: "com.eventfleet.app",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#1a1a1a",
        // Splash image is a placeholder; A4d-3 polish replaces with brand asset.
      },
    ],
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      // A4g (EAS Build setup) replaces this with the real projectId from
      // `eas init`. Placeholder UUID keeps dev workflow unblocked — only
      // `eas build` / `eas submit` actually need the real value.
      projectId: process.env.EXPO_EAS_PROJECT_ID ?? "00000000-0000-0000-0000-000000000000",
    },
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  },
};

export default config;
