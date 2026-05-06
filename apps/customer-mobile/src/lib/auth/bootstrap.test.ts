import { describe, expect, it, vi } from "vitest";

import { bootstrapAuth, validateSession } from "./bootstrap";
import { ApiError, AuthExpiredError, NetworkError } from "../api/errors";

import type { AuthUserSummary } from "../api/auth";
import type { StoredAuthSession } from "../storage/secure-token-storage";

const sampleUser: AuthUserSummary = {
  id: "11111111-1111-1111-1111-111111111111",
  phoneE164: "+905551112233",
  role: "CUSTOMER",
  displayName: "Test User",
};

const sampleSession: StoredAuthSession = {
  tokens: {
    accessToken: "access",
    refreshToken: "refresh",
    accessTokenExpiresAt: "2026-05-06T13:00:00.000Z",
    refreshTokenExpiresAt: "2026-06-05T12:45:00.000Z",
  },
  user: sampleUser,
};

describe("bootstrapAuth (initial cache check)", () => {
  it("returns 'no-session' when nothing is stored", async () => {
    const result = await bootstrapAuth({
      getStoredSession: vi.fn(() => Promise.resolve(null)),
    });
    expect(result).toEqual({ kind: "no-session" });
  });

  it("returns 'session-cached' immediately when a session is stored", async () => {
    const result = await bootstrapAuth({
      getStoredSession: vi.fn(() => Promise.resolve(sampleSession)),
    });
    expect(result).toEqual({ kind: "session-cached", session: sampleSession });
  });
});

describe("validateSession (background /auth/me check)", () => {
  it("returns 'valid' with userChanged=false when getMe matches cached user", async () => {
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.resolve(sampleUser)) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "valid", user: sampleUser, userChanged: false });
  });

  it("returns 'valid' with userChanged=true when displayName differs (server-side edit)", async () => {
    const updated: AuthUserSummary = { ...sampleUser, displayName: "Renamed" };
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.resolve(updated)) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "valid", user: updated, userChanged: true });
  });

  it("returns 'valid' with userChanged=true when role changes (admin promotion)", async () => {
    const promoted: AuthUserSummary = { ...sampleUser, role: "ADMIN" };
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.resolve(promoted)) },
      cachedUser: sampleUser,
    });
    expect(result.kind).toBe("valid");
    if (result.kind === "valid") expect(result.userChanged).toBe(true);
  });

  it("returns 'expired' when getMe throws AuthExpiredError (refresh chain dead)", async () => {
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.reject(new AuthExpiredError())) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "expired" });
  });

  it("returns 'offline' on NetworkError — does NOT log the user out", async () => {
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.reject(new NetworkError())) },
      cachedUser: sampleUser,
    });
    // Critical — keeping the session during a flaky connection is the
    // whole point of the cached-user pattern. Offline cold-start must
    // not feel like a forced logout.
    expect(result).toEqual({ kind: "offline" });
  });

  it("returns 'offline' on ApiError with 5xx (server outage)", async () => {
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.reject(new ApiError(503, { code: "UNAVAILABLE" }))) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "offline" });
  });

  it("returns 'expired' on an unknown error class (defensive)", async () => {
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.reject(new Error("panic"))) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "expired" });
  });
});
