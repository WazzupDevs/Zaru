import { z } from "zod";

import { ApiError, WrongAppRoleError } from "./errors";

import type { ApiClient } from "./client";
import type { StoredTokens } from "../storage/secure-token-storage";

/**
 * Driver auth API — wraps the backend's `/auth/driver/otp/{request,verify}`
 * + `/auth/me`. The verify response is parsed through a Zod schema with
 * a literal "DRIVER" role so a customer trying to log in here gets
 * caught by the schema (not by a runtime undef somewhere downstream).
 *
 * The role-mismatch path throws WrongAppRoleError (a typed error the
 * UI maps to a friendly Turkish message) rather than a raw ZodError,
 * so the screen layer doesn't need to know about Zod's failure mode.
 */

export const DriverAuthUserSchema = z.object({
  id: z.string(),
  phoneE164: z.string(),
  role: z.literal("DRIVER"),
  displayName: z.string().nullable(),
  /**
   * Set when the supply module has provisioned a DriverProfile for the
   * user. Null while the driver is mid-onboarding (post-invite, pre-
   * profile-create) — the home screen routes them through onboarding
   * in that case rather than letting them tap online and 404.
   */
  driverProfileId: z.string().nullable(),
});
export type AuthUserSummary = z.infer<typeof DriverAuthUserSchema>;

export const DriverAuthTokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshTokenExpiresAt: z.string(),
  user: DriverAuthUserSchema,
});
export type DriverAuthTokensResponse = z.infer<typeof DriverAuthTokensResponseSchema>;

export const RequestOtpResultSchema = z.object({
  requestId: z.string(),
  expiresAt: z.string(),
});
export type RequestOtpResult = z.infer<typeof RequestOtpResultSchema>;

export interface RequestOtpInput {
  phone: string;
}

export interface VerifyOtpInput {
  phone: string;
  requestId: string;
  code: string;
  deviceId?: string;
}

export interface AuthTokensResponse extends StoredTokens {
  user: AuthUserSummary;
}

export function createDriverAuthApi(client: ApiClient) {
  return {
    requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
      return client
        .request<unknown>("/auth/driver/otp/request", {
          method: "POST",
          anonymous: true,
          body: { phone: input.phone },
        })
        .then((data) => RequestOtpResultSchema.parse(data));
    },

    /**
     * On success the response is parsed through DriverAuthTokensResponseSchema —
     * if the role isn't "DRIVER" (e.g., a misconfigured backend or a
     * tampered response), the Zod parse throws and we re-raise as
     * WrongAppRoleError so the UI can show the right copy.
     */
    async verifyOtp(input: VerifyOtpInput): Promise<AuthTokensResponse> {
      const data = await client.request<unknown>("/auth/driver/otp/verify", {
        method: "POST",
        anonymous: true,
        body: input,
      });
      const parsed = DriverAuthTokensResponseSchema.safeParse(data);
      if (!parsed.success) {
        // The most common reason this fails is a role mismatch (a
        // customer tried to verify here). Surface that explicitly so
        // the screen doesn't have to introspect ZodError shape.
        throw new WrongAppRoleError();
      }
      return parsed.data;
    },

    /**
     * Manual refresh — same surface as the API client's auto-refresh.
     */
    refreshTokens(refreshToken: string): Promise<AuthTokensResponse> {
      return client
        .request<unknown>("/auth/tokens/refresh", {
          method: "POST",
          anonymous: true,
          body: { refreshToken },
        })
        .then((data) => DriverAuthTokensResponseSchema.parse(data));
    },

    async getMe(): Promise<AuthUserSummary> {
      const data = await client.request<unknown>("/auth/me", { method: "GET" });
      const parsed = DriverAuthUserSchema.safeParse(data);
      if (!parsed.success) {
        // /auth/me returned a non-driver user (e.g., a customer's
        // session somehow ended up in the driver storage). Surface
        // explicitly + the bootstrap flow signs them out.
        throw new WrongAppRoleError();
      }
      return parsed.data;
    },
  };
}

export type DriverAuthApi = ReturnType<typeof createDriverAuthApi>;
export { ApiError };
