import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApiClient, type ApiClientHooks } from "./client";
import { ApiError, AuthExpiredError, NetworkError } from "./errors";

import type { StoredTokens } from "../storage/secure-token-storage";

function lastInit(fetchImpl: ReturnType<typeof vi.fn>, callIndex = 0): RequestInit {
  const call = fetchImpl.mock.calls[callIndex];
  if (!call) throw new Error(`expected at least ${String(callIndex + 1)} fetch call(s)`);
  return call[1] as RequestInit;
}

const sampleTokens: StoredTokens = {
  accessToken: "access-old",
  refreshToken: "refresh-old",
  accessTokenExpiresAt: "2026-05-06T13:00:00.000Z",
  refreshTokenExpiresAt: "2026-06-05T12:45:00.000Z",
};

const refreshedTokens: StoredTokens = {
  accessToken: "access-new",
  refreshToken: "refresh-new",
  accessTokenExpiresAt: "2026-05-06T13:15:00.000Z",
  refreshTokenExpiresAt: "2026-06-05T13:00:00.000Z",
};

function makeHooks(initial: StoredTokens | null = sampleTokens): {
  hooks: ApiClientHooks;
  storage: { current: StoredTokens | null };
  onAuthFailure: ReturnType<typeof vi.fn>;
} {
  const storage = { current: initial };
  const onAuthFailure = vi.fn();
  return {
    storage,
    onAuthFailure,
    hooks: {
      getTokens: vi.fn(() => Promise.resolve(storage.current)),
      setTokens: vi.fn((t: StoredTokens) => {
        storage.current = t;
        return Promise.resolve();
      }),
      clearTokens: vi.fn(() => {
        storage.current = null;
        return Promise.resolve();
      }),
      onAuthFailure,
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiClient", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("attaches Bearer token from storage on authenticated requests", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { hooks } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    await client.request("/me");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lastInit(fetchImpl).headers).toMatchObject({
      Authorization: "Bearer access-old",
    });
  });

  it("omits Authorization header when anonymous=true", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { requestId: "abc" }));
    const { hooks } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    await client.request("/auth/otp/request", { anonymous: true });

    expect(lastInit(fetchImpl).headers).not.toHaveProperty("Authorization");
  });

  it("translates a fetch rejection into NetworkError", async () => {
    fetchImpl.mockRejectedValueOnce(new TypeError("Network request failed"));
    const { hooks } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    await expect(client.request("/me")).rejects.toBeInstanceOf(NetworkError);
  });

  it("throws ApiError carrying status + code on a non-2xx response", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(409, { code: "PRICING_QUOTE_EXPIRED", message: "expired" }),
    );
    const { hooks } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    const promise = client.request("/bookings/confirm");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 409,
      code: "PRICING_QUOTE_EXPIRED",
    });
  });

  it("on 401 → calls refresh, replays original request once with new token", async () => {
    fetchImpl
      // 1) original /me with old token → 401
      .mockResolvedValueOnce(jsonResponse(401, { code: "AUTH_EXPIRED" }))
      // 2) refresh succeeds
      .mockResolvedValueOnce(jsonResponse(200, refreshedTokens))
      // 3) /me retry with new token → 200
      .mockResolvedValueOnce(jsonResponse(200, { id: "user-1" }));

    const { hooks, storage } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    const result = await client.request<{ id: string }>("/me");

    expect(result).toEqual({ id: "user-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(storage.current).toEqual(refreshedTokens);

    // Retry used the new access token, not the old one.
    expect(lastInit(fetchImpl, 2).headers).toMatchObject({
      Authorization: "Bearer access-new",
    });
  });

  it("single-flight: 5 parallel 401s share ONE refresh, then each replays with the new token", async () => {
    // First five /me calls (one per parallel request) return 401; calls
    // 6..10 are the retries that come after refresh — those return 200.
    // Sequencing by call index rather than url because all five hit the
    // same /me path.
    let refreshCalls = 0;
    let meCallIndex = 0;
    fetchImpl.mockImplementation((url: string) => {
      if (url.endsWith("/auth/tokens/refresh")) {
        refreshCalls += 1;
        // Slight delay so all 5 in-flight 401s have a chance to register
        // their handlers on the pendingRefresh promise before it resolves.
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(jsonResponse(200, refreshedTokens));
          }, 20);
        });
      }
      meCallIndex += 1;
      const status = meCallIndex <= 5 ? 401 : 200;
      const body = status === 401 ? { code: "AUTH_EXPIRED" } : { idx: meCallIndex };
      return Promise.resolve(jsonResponse(status, body));
    });

    const { hooks, storage } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.request<{ idx: number }>("/me")),
    );

    expect(refreshCalls).toBe(1);
    expect(storage.current).toEqual(refreshedTokens);
    // All five eventually succeed.
    expect(results).toHaveLength(5);
    results.forEach((r) => {
      expect(r.idx).toBeGreaterThanOrEqual(6);
    });
  });

  it("when refresh fails: clears tokens, calls onAuthFailure, throws AuthExpiredError", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(401, { code: "AUTH_EXPIRED" }))
      .mockResolvedValueOnce(jsonResponse(401, { code: "REFRESH_REUSED" }));

    const { hooks, storage, onAuthFailure } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    await expect(client.request("/me")).rejects.toBeInstanceOf(AuthExpiredError);
    expect(storage.current).toBeNull();
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry if the second response is also 401 (no infinite loop)", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(401, { code: "AUTH_EXPIRED" }))
      .mockResolvedValueOnce(jsonResponse(200, refreshedTokens))
      .mockResolvedValueOnce(jsonResponse(401, { code: "AUTH_EXPIRED" }));

    const { hooks } = makeHooks();
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    await expect(client.request("/me")).rejects.toBeInstanceOf(ApiError);
    // 1 original + 1 refresh + 1 retry = 3, no fourth attempt.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("when no tokens are stored, a 401 throws AuthExpiredError without calling refresh", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(401, { code: "AUTH_EXPIRED" }));
    const { hooks } = makeHooks(null);
    const client = createApiClient({ baseUrl: "http://api.test", hooks, fetchImpl });

    await expect(client.request("/me")).rejects.toBeInstanceOf(AuthExpiredError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
