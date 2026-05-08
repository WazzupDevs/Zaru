import { z } from "zod";

/**
 * PATCH /users/me/push-token body. The token is the opaque string the
 * mobile app gets back from `expo-notifications.getExpoPushTokenAsync()`.
 *
 * `null` is the explicit "clear" signal — the user revoked permission
 * or signed out. The use case rejects the empty string so callers have
 * to be explicit about which case they mean.
 *
 * The regex mirrors the use case's structural check; we duplicate it
 * here so the controller's Zod pipe rejects bad input before it ever
 * reaches the use case (cheaper failure mode + the error code stays
 * VALIDATION_ERROR vs INVALID_PUSH_TOKEN, which is helpful telemetry).
 */
export const ExpoPushTokenSchema = z
  .string()
  .regex(
    /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/,
    "Must be a valid Expo push token (ExponentPushToken[...])",
  );

export const UpdatePushTokenInputSchema = z.object({
  expoPushToken: ExpoPushTokenSchema.nullable(),
});
export type UpdatePushTokenInput = z.infer<typeof UpdatePushTokenInputSchema>;
