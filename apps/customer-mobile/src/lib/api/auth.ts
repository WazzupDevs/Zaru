import type { ApiClient } from "./client";
import type { StoredTokens } from "../storage/secure-token-storage";

/**
 * Auth endpoint wrappers. Shapes match the API's @event-fleet/shared-types
 * Zod schemas (OtpRequestSchema, OtpVerifySchema, AuthTokensSchema, etc.).
 * We re-declare them here as TS interfaces rather than import the Zod
 * runtime so the mobile bundle stays slim — Zod adds ~30KB and the API
 * is the source of truth for validation. If a shape skews we'll catch
 * it via integration testing against the real API in A4-Stab-mobile.
 */

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

    verifyOtp(input: VerifyOtpInput): Promise<AuthTokensResponse> {
      return client.request<AuthTokensResponse>("/auth/otp/verify", {
        method: "POST",
        anonymous: true,
        body: input,
      });
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
