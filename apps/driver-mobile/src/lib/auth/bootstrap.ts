import { ApiError, AuthExpiredError, NetworkError, WrongAppRoleError } from "../api/errors";

import type { AuthUserSummary, DriverAuthApi } from "../api/driver-auth";
import type { StoredAuthSession } from "../storage/secure-token-storage";

/**
 * Mirrors apps/customer-mobile/src/lib/auth/bootstrap.ts but with a
 * "wrong-role" branch — if /auth/me returns a non-DRIVER user the
 * driver-auth API throws WrongAppRoleError, and the bootstrap surfaces
 * it as `expired` so the AuthProvider clears the session and bounces
 * the user to the phone screen with the role-mismatch error visible.
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

export type ValidateResult =
  | { kind: "valid"; user: AuthUserSummary; userChanged: boolean }
  | { kind: "expired" }
  | { kind: "offline" };

export interface ValidateDeps {
  authApi: Pick<DriverAuthApi, "getMe">;
  cachedUser: AuthUserSummary;
}

function userEquals(a: AuthUserSummary, b: AuthUserSummary): boolean {
  // role is statically `"DRIVER"` for both — TS narrows the comparison
  // to always-true. We skip it on the equality check (same reasoning
  // as customer-mobile) since the storage shape guard already rejects
  // any non-DRIVER role on read.
  return a.id === b.id && a.phoneE164 === b.phoneE164 && a.displayName === b.displayName;
}

export async function validateSession(deps: ValidateDeps): Promise<ValidateResult> {
  try {
    const fresh = await deps.authApi.getMe();
    return { kind: "valid", user: fresh, userChanged: !userEquals(fresh, deps.cachedUser) };
  } catch (err) {
    if (err instanceof AuthExpiredError) return { kind: "expired" };
    if (err instanceof WrongAppRoleError) return { kind: "expired" };
    if (err instanceof NetworkError) return { kind: "offline" };
    if (err instanceof ApiError && err.status >= 500) return { kind: "offline" };
    return { kind: "expired" };
  }
}
