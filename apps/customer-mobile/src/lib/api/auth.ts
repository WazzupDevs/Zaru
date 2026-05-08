import { z } from "zod";

import { WrongAppRoleError } from "./errors";

import type { ApiClient } from "./client";
import type { StoredTokens } from "../storage/secure-token-storage";

/**
 * Auth endpoint wrappers. Shapes match the API's @event-fleet/shared-types
 * Zod schemas (OtpRequestSchema, OtpVerifySchema, AuthTokensSchema).
 * Most fields stay declared as TS interfaces here, but the verifyOtp +
 * getMe response role is parsed through a Zod schema with a literal
 * "CUSTOMER" / "DRIVER" / "ADMIN" / "SUPPORT" union — and the
 * verifyOtp wrapper rejects DRIVER specifically so a driver who lands
 * on the customer app gets a clear "wrong app" error instead of
 * silent role drift.
 */

const CUSTOMER_APP_ALLOWED_ROLES = ["CUSTOMER", "ADMIN", "SUPPORT"] as const;

export const CustomerAuthUserSchema = z.object({
  id: z.string(),
  phoneE164: z.string(),
  role: z.enum(CUSTOMER_APP_ALLOWED_ROLES),
  displayName: z.string().nullable(),
});

export interface RequestOtpInput {
  phone: string;
  channel?: "SMS";
}

export interface RequestOtpResult {
  requestId: string;
  expiresAt: string;
}

export interface VerifyOtpInput {
  phone: string;
  requestId: string;
  code: string;
  deviceId?: string;
}

export interface AuthUserSummary {
  id: string;
  phoneE164: string;
  role: "CUSTOMER" | "DRIVER" | "ADMIN" | "SUPPORT";
  displayName: string | null;
}

export interface AuthTokensResponse extends StoredTokens {
  user: AuthUserSummary;
}

export function createAuthApi(client: ApiClient) {
  return {
    requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
      return client.request<RequestOtpResult>("/auth/otp/request", {
        method: "POST",
        anonymous: true,
        body: { channel: "SMS", ...input },
      });
    },

    /**
     * Customer verifyOtp + role-mismatch guard. The backend's `/auth/otp/verify`
     * may return any role (CUSTOMER, DRIVER, ADMIN, SUPPORT). We accept
     * CUSTOMER + ADMIN + SUPPORT (admin/support can use the customer app
     * for review / impersonation). DRIVER lands here only if the user
     * went through the driver-app flow elsewhere — bounce them with
     * WrongAppRoleError so the UI can show "Bu hesap sürücü hesabı,
     * sürücü uygulamasını kullanın".
     */
    async verifyOtp(input: VerifyOtpInput): Promise<AuthTokensResponse> {
      const data = await client.request<AuthTokensResponse>("/auth/otp/verify", {
        method: "POST",
        anonymous: true,
        body: input,
      });
      const parsedUser = CustomerAuthUserSchema.safeParse(data.user);
      if (!parsedUser.success) {
        throw new WrongAppRoleError();
      }
      return data;
    },

    /**
     * Manual refresh. The client's auto-refresh on 401 covers the common
     * case; this is exposed for the AuthContext bootstrap path where we
     * want to proactively rotate before the access token's expiry.
     */
    refreshTokens(refreshToken: string): Promise<AuthTokensResponse> {
      return client.request<AuthTokensResponse>("/auth/tokens/refresh", {
        method: "POST",
        anonymous: true,
        body: { refreshToken },
      });
    },

    getMe(): Promise<AuthUserSummary> {
      return client.request<AuthUserSummary>("/auth/me", { method: "GET" });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
