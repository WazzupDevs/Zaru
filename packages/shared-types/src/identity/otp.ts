import { z } from "zod";

import { UserRoleSchema } from "./user-role.js";
import { PhoneE164Schema } from "../common/phone.js";
import { UuidSchema } from "../common/uuid.js";

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
  requestId: UuidSchema,
  expiresAt: z.string().datetime(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

export const OtpVerifySchema = z.object({
  phone: PhoneE164Schema,
  requestId: UuidSchema,
  code: z.string().regex(/^\d{6}$/, "6-digit numeric code required"),
  // Optional client metadata (recorded on the rotation chain)
  deviceId: z.string().max(128).optional(),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

export const AuthUserSummarySchema = z.object({
  id: UuidSchema,
  phoneE164: PhoneE164Schema,
  role: UserRoleSchema,
  displayName: z.string().nullable(),
});
export type AuthUserSummary = z.infer<typeof AuthUserSummarySchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string().datetime(),
  refreshTokenExpiresAt: z.string().datetime(),
  user: AuthUserSummarySchema,
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const RefreshTokensRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokensRequest = z.infer<typeof RefreshTokensRequestSchema>;
