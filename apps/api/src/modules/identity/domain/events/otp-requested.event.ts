/**
 * Emitted when a new OTP request is created and dispatched to the SMS provider.
 * Payload deliberately excludes the OTP code itself — sensitive material
 * never enters the event stream.
 */
export interface OtpRequestedEventPayload {
  requestId: string;
  phoneE164: string;
  channel: "SMS";
  purpose: "LOGIN";
  expiresAt: string; // ISO-8601
  ipAddress?: string;
}

export const OTP_REQUESTED_EVENT_TYPE = "identity.OtpRequested";

export function buildOtpRequestedEvent(payload: OtpRequestedEventPayload): {
  type: string;
  payload: OtpRequestedEventPayload;
} {
  return { type: OTP_REQUESTED_EVENT_TYPE, payload };
}
