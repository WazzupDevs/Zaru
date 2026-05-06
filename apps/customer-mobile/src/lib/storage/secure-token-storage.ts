import * as SecureStore from "expo-secure-store";

import type { AuthUserSummary } from "../api/auth";

/**
 * Persisted auth session — tokens + the user summary, kept together
 * in iOS Keychain / Android Keystore via Expo SecureStore. Storing the
 * user alongside the tokens lets us render the (app) tree optimistically
 * during a cold start, before the background `/auth/me` call comes back —
 * critical for offline launches where bootstrap would otherwise have no
 * user object to render.
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

export interface StoredAuthSession {
  tokens: StoredTokens;
  user: AuthUserSummary;
}

// v2 because A4d-1 stored only tokens. The v1 key dies on next install
// (orphaned, harmless on a fresh dev install — the project hasn't shipped
// a real build yet so no one has the v1 entry on a real device).
const SESSION_KEY = "event_fleet_auth_session_v2";

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

function isStoredAuthSession(value: unknown): value is StoredAuthSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isStoredTokens(v.tokens)) return false;
  const user = v.user as Record<string, unknown> | null | undefined;
  if (typeof user !== "object" || user === null) return false;
  return (
    typeof user.id === "string" &&
    typeof user.phoneE164 === "string" &&
    typeof user.role === "string" &&
    (user.displayName === null || typeof user.displayName === "string")
  );
}

/**
 * Read the persisted session.
 *
 * Returns `null` when:
 *   - no session has been stored yet (cold install)
 *   - the stored value is corrupt (malformed JSON OR shape mismatch) —
 *     in that case the corrupt entry is also wiped so a clean re-login
 *     can replace it. We never throw at the call site because corruption
 *     would otherwise crash the auth bootstrap on every cold start.
 */
export async function getSession(): Promise<StoredAuthSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredAuthSession(parsed)) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
}

export async function setSession(session: StoredAuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

/**
 * Convenience: read just the tokens. The API client doesn't care about the
 * user summary, so this lets `createApiClient`'s hooks stay narrow without
 * forcing every read site to destructure the session.
 */
export async function getTokens(): Promise<StoredTokens | null> {
  const session = await getSession();
  return session ? session.tokens : null;
}

/**
 * Convenience: rotate tokens in place after a refresh. Preserves the
 * cached user. Used by the API client's onRefresh hook.
 */
export async function setTokens(tokens: StoredTokens): Promise<void> {
  const existing = await getSession();
  if (!existing) {
    // Refresh path with no session is impossible in practice (the client
    // only refreshes when it has tokens), but defensively bail rather
    // than persist tokens-without-user.
    return;
  }
  await setSession({ tokens, user: existing.user });
}

/**
 * Alias so API client hooks stay readable (`clearTokens` reads better
 * than `clearSession` for the refresh-failed code path even though both
 * wipe the same entry).
 */
export const clearTokens = clearSession;
