import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { Logger } from "../logger";

/**
 * Driver-app push token service. Mirrors apps/customer-mobile/src/lib/
 * push/push-token-service.ts with two driver-spesifik tweaks:
 *
 *   ANDROID_CHANNEL_ID — "dispatch" (driver dispatch offers) instead
 *     of the customer's "bookings". Different OS channel so the user
 *     can manage the two notification streams independently in the
 *     Android System Settings → App → Notifications surface.
 *
 *   sound: "default" — explicit on the channel definition. A driver
 *     missing a dispatch notification (silent or buried) is the
 *     worst-case operational failure; the channel always plays sound,
 *     and the user can mute via System Settings if they want.
 *
 * Three soft-null paths so the AuthContext caller can swallow without
 * breaking auth: simulator, denied permission, placeholder projectId.
 */
const PLACEHOLDER_PROJECT_ID = "00000000-0000-0000-0000-000000000000";
const ANDROID_CHANNEL_ID = "dispatch";

function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId;
  if (typeof projectId !== "string" || projectId.length === 0) return null;
  if (projectId === PLACEHOLDER_PROJECT_ID) return null;
  return projectId;
}

export const PushTokenService = {
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

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "İş Bildirimleri",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#4ade80",
        sound: "default",
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
