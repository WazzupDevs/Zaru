import { describe, expect, it, vi } from "vitest";

import { createAuthApi } from "./auth";
import { createApiClient } from "./client";

function clientWithMockFetch(fetchImpl: ReturnType<typeof vi.fn>) {
  return createApiClient({
    baseUrl: "http://api.test",
    fetchImpl,
    hooks: {
      getTokens: vi.fn(() => Promise.resolve(null)),
      setTokens: vi.fn(() => Promise.resolve()),
      clearTokens: vi.fn(() => Promise.resolve()),
    },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("authApi", () => {
  it("requestOtp posts to /auth/otp/request with default channel SMS", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        requestId: "11111111-1111-1111-1111-111111111111",
        expiresAt: "2026-05-06T13:00:00.000Z",
      }),
    );
    const auth = createAuthApi(clientWithMockFetch(fetchImpl));

    const result = await auth.requestOtp({ phone: "+905551112233" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/auth/otp/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ channel: "SMS", phone: "+905551112233" }),
      }),
    );
    expect(result.requestId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("verifyOtp posts to /auth/otp/verify with requestId + 6-digit code + optional deviceId", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        accessToken: "access",
        refreshToken: "refresh",
        accessTokenExpiresAt: "2026-05-06T13:00:00.000Z",
        refreshTokenExpiresAt: "2026-06-05T12:45:00.000Z",
        user: {
          id: "u1",
          phoneE164: "+905551112233",
          role: "CUSTOMER",
          displayName: null,
        },
      }),
    );
    const auth = createAuthApi(clientWithMockFetch(fetchImpl));

    const result = await auth.verifyOtp({
      phone: "+905551112233",
      requestId: "11111111-1111-1111-1111-111111111111",
      code: "123456",
      deviceId: "iphone-15-pro",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/auth/otp/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          phone: "+905551112233",
          requestId: "11111111-1111-1111-1111-111111111111",
          code: "123456",
          deviceId: "iphone-15-pro",
        }),
      }),
    );
    expect(result.user.role).toBe("CUSTOMER");
  });

  it("getMe issues an authenticated GET to /auth/me", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "u1",
          phoneE164: "+905551112233",
          role: "CUSTOMER",
          displayName: "X",
        }),
      );
    const auth = createAuthApi(clientWithMockFetch(fetchImpl));

    const me = await auth.getMe();

    expect(me.id).toBe("u1");
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error("expected one fetch call");
    expect((call[1] as RequestInit).method).toBe("GET");
  });
});
