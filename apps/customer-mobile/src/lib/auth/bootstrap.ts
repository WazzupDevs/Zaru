import { ApiError, AuthExpiredError, NetworkError } from "../api/errors";

import type { AuthApi, AuthUserSummary } from "../api/auth";
import type { StoredAuthSession } from "../storage/secure-token-storage";

/**
 * The cold-start auth bootstrap. Now in the offline-first split:
 *
 *   bootstrapAuth() — synchronous-feel: returns whatever's in SecureStore.
 *     If a session is cached, AuthContext renders the (app) tree
 *     immediately with that user — even before the network is reachable.
 *
 *   validateSession() — background: fires `/auth/me` to confirm the
 *     cached session is still good, picks up server-side changes (e.g.,
 *     displayName edited from another device), and signals AuthContext
 *     to log the user out if the refresh chain has fully expired.
 *
 * Both functions are pure: deps are passed in, no React, no SecureStore
 * imports — so each path stays unit-testable without booting the
 * provider.
 */

export type BootstrapResult =
  | { kind: "no-session" }
  | { kind: "session-cached"; session: StoredAuthSession };

export interface BootstrapDeps {
  getStoredSession: () => Promise<StoredAuthSession | null>;
}

export async function bootstrapAuth(deps: BootstrapDeps): Promise<BootstrapResult> {
  const session = await deps.getStoredSession();
  if (!session) return { kind: "no-session" };
  return { kind: "session-cached", session };
}

/**
 * Background validation result.
 *
 *   valid     — `/auth/me` came back 200. The user object may have
 *               changed (server-side edit), so AuthContext should
 *               persist + replace state if `userChanged` is true.
 *   expired   — refresh chain is dead (got 401 even after the API
 *               client's auto-refresh, OR an unknown error). AuthContext
 *               clears the session and bounces to (auth)/phone.
 *   offline   — couldn't reach the server (NetworkError or 5xx). The
 *               cached session stays — we don't log the user out for a
 *               flaky connection.
 */
export type ValidateResult =
  | { kind: "valid"; user: AuthUserSummary; userChanged: boolean }
  | { kind: "expired" }
  | { kind: "offline" };

export interface ValidateDeps {
  authApi: Pick<AuthApi, "getMe">;
  cachedUser: AuthUserSummary;
}

function userEquals(a: AuthUserSummary, b: AuthUserSummary): boolean {
  return (
    a.id === b.id &&
    a.phoneE164 === b.phoneE164 &&
    a.role === b.role &&
    a.displayName === b.displayName
  );
}

export async function validateSession(deps: ValidateDeps): Promise<ValidateResult> {
  try {
    const fresh = await deps.authApi.getMe();
    return { kind: "valid", user: fresh, userChanged: !userEquals(fresh, deps.cachedUser) };
  } catch (err) {
    if (err instanceof AuthExpiredError) return { kind: "expired" };
    if (err instanceof NetworkError) return { kind: "offline" };
    if (err instanceof ApiError && err.status >= 500) return { kind: "offline" };
    // Unknown error — treat as expired so the user lands somewhere
    // usable rather than seeing a frozen splash.
    return { kind: "expired" };
  }
}
