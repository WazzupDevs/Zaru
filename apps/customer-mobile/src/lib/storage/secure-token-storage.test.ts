import * as SecureStore from "expo-secure-store";
import { describe, expect, it, vi } from "vitest";

import {
  clearSession,
  clearTokens,
  getSession,
  getTokens,
  setSession,
  setTokens,
  type StoredAuthSession,
  type StoredTokens,
} from "./secure-token-storage";

const sampleTokens: StoredTokens = {
  accessToken: "access-abc",
  refreshToken: "refresh-xyz",
  accessTokenExpiresAt: "2026-05-06T13:00:00.000Z",
  refreshTokenExpiresAt: "2026-06-05T12:45:00.000Z",
};

const sampleSession: StoredAuthSession = {
  tokens: sampleTokens,
  user: {
    id: "11111111-1111-1111-1111-111111111111",
    phoneE164: "+905551112233",
    role: "CUSTOMER",
    displayName: "Test User",
  },
};

describe("secure-token-storage (session shape)", () => {
  it("returns null when no session has been stored", async () => {
    expect(await getSession()).toBeNull();
    expect(await getTokens()).toBeNull();
  });

  it("round-trips a session through SecureStore", async () => {
    await setSession(sampleSession);
    expect(await getSession()).toEqual(sampleSession);
    expect(await getTokens()).toEqual(sampleTokens);
  });

  it("clearSession deletes the persisted entry", async () => {
    await setSession(sampleSession);
    await clearSession();
    expect(await getSession()).toBeNull();
  });

  it("clearTokens is an alias for clearSession", async () => {
    await setSession(sampleSession);
    await clearTokens();
    expect(await getSession()).toBeNull();
  });

  it("setTokens preserves the cached user (refresh-rotation path)", async () => {
    await setSession(sampleSession);
    const rotated: StoredTokens = {
      accessToken: "access-new",
      refreshToken: "refresh-new",
      accessTokenExpiresAt: "2026-05-06T13:15:00.000Z",
      refreshTokenExpiresAt: "2026-06-05T13:00:00.000Z",
    };
    await setTokens(rotated);

    const reread = await getSession();
    expect(reread?.tokens).toEqual(rotated);
    // Critical — user must survive a token rotation. Otherwise a refresh
    // mid-session would orphan the user object and force re-login.
    expect(reread?.user).toEqual(sampleSession.user);
  });

  it("setTokens with no existing session is a no-op (defensive)", async () => {
    await setTokens(sampleTokens);
    expect(await getSession()).toBeNull();
  });

  it("returns null AND wipes the entry when stored value is malformed JSON", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("not-valid-json{");

    const result = await getSession();

    expect(result).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("event_fleet_auth_session_v2");
  });

  it("returns null AND wipes the entry when shape is wrong (legacy v1 tokens-only)", async () => {
    // A v1 (A4d-1) entry would have only the tokens — our v2 reader
    // rejects it and wipes so the user re-logs in cleanly.
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(sampleTokens));

    const result = await getSession();

    expect(result).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("event_fleet_auth_session_v2");
  });

  it("returns null AND wipes the entry when user.role is missing (corruption)", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
      JSON.stringify({
        tokens: sampleTokens,
        user: { id: "x", phoneE164: "+905551112233", displayName: null },
      }),
    );

    const result = await getSession();

    expect(result).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("event_fleet_auth_session_v2");
  });

  it("returns null AND wipes the entry when stored value is the JSON literal `null`", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("null");

    const result = await getSession();

    expect(result).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("event_fleet_auth_session_v2");
  });
});
