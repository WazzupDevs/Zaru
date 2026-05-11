import * as SecureStore from "expo-secure-store";

import type { AuthUserSummary } from "../api/driver-auth";

/**
 * Same shape as customer-mobile/src/lib/storage/secure-token-storage —
 * tokens + user persisted together so cold-start renders the (app) tree
 * before the background `/auth/me` lands. SESSION_KEY is namespaced per
 * app (the OS Keychain shares storage when both apps install on one
 * device); the `_driver_` infix keeps customer + driver sessions
 * separate without a collision.
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

const SESSION_KEY = "event_fleet_driver_auth_session_v1";

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
  if (typeof v.user !== "object" || v.user === null) return false;
  // Driver app accepts only role=DRIVER. If a stale session somehow
  // has a different role (e.g., a dev build leaked a customer session
  // here), treat as corruption + wipe. Read role through `unknown`
  // so the type narrowing doesn't make ESLint flag the comparison
  // as always-true.
  const user = v.user as Record<string, unknown>;
  const role: unknown = user.role;
  return (
    typeof user.id === "string" &&
    typeof user.phoneE164 === "string" &&
    role === "DRIVER" &&
    (user.displayName === null || typeof user.displayName === "string")
  );
}

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

export async function getTokens(): Promise<StoredTokens | null> {
  const session = await getSession();
  return session ? session.tokens : null;
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  const existing = await getSession();
  if (!existing) return;
  await setSession({ tokens, user: existing.user });
}

export const clearTokens = clearSession;
