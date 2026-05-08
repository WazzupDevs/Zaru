import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { Logger } from "../logger";

/**
 * Wraps expo-notifications + expo-device into the two surfaces the
 * AuthContext needs:
 *
 *   requestPermissionAndGetToken() — call once after a successful OTP
 *     verify. Walks the permission flow + Android channel setup +
 *     getExpoPushTokenAsync. Returns null on every "soft" failure (no
 *     device, no permission, no real Expo project) so the caller can
 *     swallow + carry on without breaking auth.
 *
 *   configureForegroundBehavior() — call once at module load. Tells
 *     expo-notifications to show the OS alert + play sound when a
 *     push arrives while the app is foregrounded (otherwise the
 *     default behavior is to deliver silently to the data handler).
 *
 * Placeholder projectId guard: A4d-1 set the EAS projectId to the
 * placeholder UUID `00000000-...`. Calling getExpoPushTokenAsync with
 * the placeholder fails — we detect it ourselves so registration
 * silently no-ops until A4g flips a real UUID into the env.
 */
const PLACEHOLDER_PROJECT_ID = "00000000-0000-0000-0000-000000000000";
const ANDROID_CHANNEL_ID = "bookings";

function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId;
  if (typeof projectId !== "string" || projectId.length === 0) return null;
  if (projectId === PLACEHOLDER_PROJECT_ID) return null;
  return projectId;
}

export const PushTokenService = {
  /**
   * Returns the Expo push token, or null if registration was a no-op.
   * Three null paths:
   *   - simulator (Device.isDevice false)
   *   - permission denied
   *   - placeholder projectId (A4g hasn't set the real one yet)
   */
  async requestPermissionAndGetToken(): Promise<string | null> {
    if (!Device.isDevice) {
      Logger.info("push_skip_simulator");
      return null;
    }

    const existing = await Notifications.getPermissionsAsync();
    let status: string = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") {
      Logger.info("push_permission_denied");
      return null;
    }

    // Android requires a notification channel before any push will
    // surface. Importance HIGH = head-up + sound + vibration.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Rezervasyon Bildirimleri",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#d4af37",
      });
    }

    const projectId = getProjectId();
    if (!projectId) {
      Logger.warn("push_placeholder_project_id");
      return null;
    }

    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      Logger.info("push_token_obtained", {
        // Logger redaction handles the full token; the prefix is here
        // so dev consoles can correlate without revealing the token.
        tokenPrefix: result.data.slice(0, 18),
      });
      return result.data;
    } catch (err) {
      Logger.warn("push_token_request_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  /**
   * Tell expo-notifications to surface foregrounded pushes. Without
   * this, a push that arrives while the app is open delivers silently
   * to handleNotification only — no banner, no sound. Call once at
   * the root layout module load.
   */
  configureForegroundBehavior(): void {
    Notifications.setNotificationHandler({
      handleNotification: () =>
        Promise.resolve({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
    });
  },
};
