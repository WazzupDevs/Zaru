import * as SecureStore from "expo-secure-store";
import { describe, expect, it, vi } from "vitest";

import { clearTokens, getTokens, setTokens, type StoredTokens } from "./secure-token-storage";

const sampleTokens: StoredTokens = {
  accessToken: "access-abc",
  refreshToken: "refresh-xyz",
  accessTokenExpiresAt: "2026-05-06T13:00:00.000Z",
  refreshTokenExpiresAt: "2026-06-05T12:45:00.000Z",
};

describe("secure-token-storage", () => {
  it("returns null when no tokens have been stored", async () => {
    expect(await getTokens()).toBeNull();
  });

  it("round-trips tokens through SecureStore", async () => {
    await setTokens(sampleTokens);
    expect(await getTokens()).toEqual(sampleTokens);
  });

  it("clearTokens deletes the persisted entry", async () => {
    await setTokens(sampleTokens);
    await clearTokens();
    expect(await getTokens()).toBeNull();
  });

  it("returns null AND wipes the entry when stored value is malformed JSON", async () => {
    // Simulate a SecureStore that yields non-JSON garbage. Could happen
    // after an OS-level keystore migration corruption, or from a previous
    // app version that wrote a different shape.
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("not-valid-json{");

    const result = await getTokens();

    expect(result).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("event_fleet_auth_tokens_v1");
  });

  it("returns null AND wipes the entry when shape is wrong (missing fields)", async () => {
    // A previous app version may have written a partial / different shape.
    // The wrapper must self-heal rather than crash the auth bootstrap.
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
      JSON.stringify({ accessToken: "only-this", somethingElse: 42 }),
    );

    const result = await getTokens();

    expect(result).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("event_fleet_auth_tokens_v1");
  });

  it("returns null AND wipes the entry when stored value is the JSON literal `null`", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("null");

    const result = await getTokens();

    expect(result).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("event_fleet_auth_tokens_v1");
  });
});
