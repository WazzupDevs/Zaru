import * as SecureStore from "expo-secure-store";

/**
 * Persisted auth tokens — kept in iOS Keychain / Android Keystore via
 * Expo SecureStore. Plaintext access tokens never touch AsyncStorage
 * because that storage is unencrypted on Android and trivially readable
 * on a rooted device.
 *
 * `accessTokenExpiresAt` and `refreshTokenExpiresAt` are ISO strings (the
 * shape the API returns). Parsed at usage sites — keeping them as strings
 * here means SecureStore round-tripping doesn't lose Date precision and
 * the JSON layer is straightforward.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

const STORAGE_KEY = "event_fleet_auth_tokens_v1";

function isStoredTokens(value: unknown): value is StoredTokens {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.accessTokenExpiresAt === "string" &&
    typeof v.refreshTokenExpiresAt === "string"
  );
}

/**
 * Read the persisted tokens.
 *
 * Returns `null` when:
 *   - no tokens have been stored yet (cold install)
 *   - the stored value is corrupt (malformed JSON OR shape mismatch) —
 *     in that case the corrupt entry is also wiped so a clean re-login
 *     can replace it. We never throw at the call site because corruption
 *     would otherwise crash the auth bootstrap on every cold start.
 */
export async function getTokens(): Promise<StoredTokens | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredTokens(parsed)) {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    return null;
  }
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
