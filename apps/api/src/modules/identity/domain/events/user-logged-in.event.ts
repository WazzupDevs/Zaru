/**
 * Emitted on every successful OTP verify, even for returning users.
 * Used by analytics / audit / fraud-detection downstream.
 */
export interface UserLoggedInEventPayload {
  userId: string;
  phoneE164: string;
  loggedInAt: string; // ISO-8601
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

export const USER_LOGGED_IN_EVENT_TYPE = "identity.UserLoggedIn";
