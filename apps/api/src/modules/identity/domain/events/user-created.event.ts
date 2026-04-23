import type { UserRole } from "@event-fleet/shared-types";

/**
 * Emitted exactly once when a phone number completes its first successful
 * OTP verify and a User row is provisioned.
 */
export interface UserCreatedEventPayload {
  userId: string;
  phoneE164: string;
  role: UserRole;
  createdAt: string; // ISO-8601
}

export const USER_CREATED_EVENT_TYPE = "identity.UserCreated";
