import { z } from "zod";

import { PhoneE164Schema } from "../common/phone.js";

export const OtpChannelSchema = z.enum(["SMS"]);
export type OtpChannel = z.infer<typeof OtpChannelSchema>;

export const OtpPurposeSchema = z.enum(["LOGIN"]);
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;

export const OtpRequestSchema = z.object({
  phone: PhoneE164Schema,
  channel: OtpChannelSchema.default("SMS"),
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpRequestResponseSchema = z.object({
  requestId: z.string().uuid(),
  expiresAt: z.string().datetime(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;
