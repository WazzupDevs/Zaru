/**
 * Emitted when an OTP request is successfully consumed.
 * Code itself never enters the payload.
 */
export interface OtpVerifiedEventPayload {
  requestId: string;
  phoneE164: string;
  userId: string;
  verifiedAt: string; // ISO-8601
}

export const OTP_VERIFIED_EVENT_TYPE = "identity.OtpVerified";
