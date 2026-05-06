import { describe, expect, it, vi } from "vitest";

import { bootstrapAuth, type BootstrapDeps } from "./bootstrap";
import { ApiError, AuthExpiredError, NetworkError } from "../api/errors";

import type { AuthUserSummary } from "../api/auth";
import type { StoredTokens } from "../storage/secure-token-storage";

const sampleTokens: StoredTokens = {
  accessToken: "access",
  refreshToken: "refresh",
  accessTokenExpiresAt: "2026-05-06T13:00:00.000Z",
  refreshTokenExpiresAt: "2026-06-05T12:45:00.000Z",
};

const sampleUser: AuthUserSummary = {
  id: "u1",
  phoneE164: "+905551112233",
  role: "CUSTOMER",
  displayName: "Test User",
};

function makeDeps(overrides: Partial<BootstrapDeps> = {}): BootstrapDeps {
  return {
    getStoredTokens: vi.fn(() => Promise.resolve(sampleTokens)),
    clearStoredTokens: vi.fn(() => Promise.resolve()),
    authApi: { getMe: vi.fn(() => Promise.resolve(sampleUser)) },
    ...overrides,
  };
}

describe("bootstrapAuth", () => {
  it("returns 'no-session' when no tokens are stored (cold install)", async () => {
    const deps = makeDeps({ getStoredTokens: vi.fn(() => Promise.resolve(null)) });
    const result = await bootstrapAuth(deps);
    expect(result).toEqual({ kind: "no-session" });
    expect(deps.authApi.getMe).not.toHaveBeenCalled();
  });

  it("returns 'authenticated' with user + tokens when getMe succeeds", async () => {
    const deps = makeDeps();
    const result = await bootstrapAuth(deps);
    expect(result).toEqual({ kind: "authenticated", user: sampleUser, tokens: sampleTokens });
  });

  it("returns 'expired' AND clears tokens when getMe throws AuthExpiredError", async () => {
    const deps = makeDeps({
      authApi: { getMe: vi.fn(() => Promise.reject(new AuthExpiredError())) },
    });
    const result = await bootstrapAuth(deps);
    expect(result).toEqual({ kind: "expired" });
    expect(deps.clearStoredTokens).toHaveBeenCalledTimes(1);
  });

  it("returns 'offline' WITHOUT clearing tokens when getMe throws NetworkError", async () => {
    const deps = makeDeps({
      authApi: { getMe: vi.fn(() => Promise.reject(new NetworkError())) },
    });
    const result = await bootstrapAuth(deps);
    expect(result).toEqual({ kind: "offline", tokens: sampleTokens });
    // Critical — keeping tokens during offline cold-start prevents every
    // airplane-mode launch from logging the user out.
    expect(deps.clearStoredTokens).not.toHaveBeenCalled();
  });

  it("returns 'offline' when getMe throws ApiError with 5xx status (server outage)", async () => {
    const deps = makeDeps({
      authApi: { getMe: vi.fn(() => Promise.reject(new ApiError(503, { code: "UNAVAILABLE" }))) },
    });
    const result = await bootstrapAuth(deps);
    expect(result).toEqual({ kind: "offline", tokens: sampleTokens });
    expect(deps.clearStoredTokens).not.toHaveBeenCalled();
  });

  it("returns 'expired' AND clears tokens when getMe throws an unknown error", async () => {
    const deps = makeDeps({
      authApi: {
        getMe: vi.fn(() => Promise.reject(new Error("panic: undefined is not a function"))),
      },
    });
    const result = await bootstrapAuth(deps);
    expect(result).toEqual({ kind: "expired" });
    expect(deps.clearStoredTokens).toHaveBeenCalledTimes(1);
  });
});
