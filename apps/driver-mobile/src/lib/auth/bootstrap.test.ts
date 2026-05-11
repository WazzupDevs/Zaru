import { describe, expect, it, vi } from "vitest";

import { bootstrapAuth, validateSession } from "./bootstrap";
import { ApiError, AuthExpiredError, NetworkError, WrongAppRoleError } from "../api/errors";

import type { AuthUserSummary } from "../api/driver-auth";
import type { StoredAuthSession } from "../storage/secure-token-storage";

const sampleUser: AuthUserSummary = {
  id: "11111111-1111-1111-1111-111111111111",
  phoneE164: "+905551112233",
  role: "DRIVER",
  displayName: "Test Driver",
  driverProfileId: "22222222-2222-2222-2222-222222222222",
};

const sampleSession: StoredAuthSession = {
  tokens: {
    accessToken: "access",
    refreshToken: "refresh",
    accessTokenExpiresAt: "2026-05-12T13:00:00.000Z",
    refreshTokenExpiresAt: "2026-06-11T12:45:00.000Z",
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
    const updated: AuthUserSummary = { ...sampleUser, displayName: "Renamed Driver" };
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.resolve(updated)) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "valid", user: updated, userChanged: true });
  });

  it("returns 'expired' when getMe throws AuthExpiredError (refresh chain dead)", async () => {
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.reject(new AuthExpiredError())) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "expired" });
  });

  it("returns 'expired' when getMe throws WrongAppRoleError (role flipped server-side)", async () => {
    // Defends against an admin demoting a driver to CUSTOMER mid-session,
    // or a stale build with a customer session leaking into driver
    // storage. The bootstrap surfaces 'expired' so AuthProvider clears
    // and bounces to phone screen.
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.reject(new WrongAppRoleError())) },
      cachedUser: sampleUser,
    });
    expect(result).toEqual({ kind: "expired" });
  });

  it("returns 'offline' on NetworkError — does NOT log the user out", async () => {
    const result = await validateSession({
      authApi: { getMe: vi.fn(() => Promise.reject(new NetworkError())) },
      cachedUser: sampleUser,
    });
    // Critical — drivers may cold-start in a basement parking lot. An
    // offline boot must not feel like a forced logout.
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
