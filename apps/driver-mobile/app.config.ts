import type { ExpoConfig } from "expo/config";

/**
 * Driver app — separate Apple/Google listing from customer-mobile so the
 * two audiences don't collide (different keywords, different update
 * cycles). bundleId mirrors customer's `com.eventfleet.app` shape with
 * a `.driver` suffix.
 *
 * EAS projectId is the placeholder from A4d-1; A4g (production deploy)
 * sets the real UUID via EXPO_EAS_PROJECT_ID env. PushTokenService
 * already detects the placeholder + silently no-ops — registration
 * lands in A4f-1b alongside the home toggle UX.
 */
const config: ExpoConfig = {
  name: "Event Fleet Sürücü",
  slug: "event-fleet-driver",
  scheme: "eventfleetdriver",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.eventfleet.driver",
    supportsTablet: false,
  },
  android: {
    package: "com.eventfleet.driver",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0a0a0a",
      },
    ],
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env.EXPO_EAS_PROJECT_ID ?? "00000000-0000-0000-0000-000000000000",
    },
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  },
};

export default config;
