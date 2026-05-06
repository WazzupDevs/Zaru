import { ApiError, AuthExpiredError, NetworkError } from "../api/errors";

import type { AuthApi, AuthUserSummary } from "../api/auth";
import type { StoredTokens } from "../storage/secure-token-storage";

/**
 * The cold-start auth bootstrap. Pure async function — takes the
 * dependencies as arguments so it can be tested without React or
 * SecureStore. AuthContext calls this on mount and dispatches the
 * result into its state machine.
 *
 * Three terminal outcomes:
 *
 *   {kind: "no-session"}
 *     No tokens were ever persisted (cold install) OR the persisted
 *     entry was already wiped by the storage corruption guard. Send
 *     the user to (auth)/phone.
 *
 *   {kind: "authenticated", user, tokens}
 *     Tokens loaded, getMe() came back 200 with the user summary.
 *     Render the (app) group.
 *
 *   {kind: "expired"}
 *     We had tokens but they're invalid (401 even after the API
 *     client's auto-refresh) — wipe storage, send to (auth)/phone.
 *     Same UX as no-session but distinguishable in telemetry.
 *
 *   {kind: "offline", tokens}
 *     getMe() failed with NetworkError. We don't *know* if the user
 *     is still authenticated; we keep the tokens and let the screen
 *     decide (typically: render (app) optimistically and show an
 *     "offline" banner; subsequent API calls will surface the truth).
 *     Without this branch, every cold start in airplane mode would
 *     log the user out.
 */
export type BootstrapResult =
  | { kind: "no-session" }
  | { kind: "authenticated"; user: AuthUserSummary; tokens: StoredTokens }
  | { kind: "expired" }
  | { kind: "offline"; tokens: StoredTokens };

export interface BootstrapDeps {
  getStoredTokens: () => Promise<StoredTokens | null>;
  clearStoredTokens: () => Promise<void>;
  authApi: Pick<AuthApi, "getMe">;
}

export async function bootstrapAuth(deps: BootstrapDeps): Promise<BootstrapResult> {
  const tokens = await deps.getStoredTokens();
  if (!tokens) return { kind: "no-session" };

  try {
    const user = await deps.authApi.getMe();
    return { kind: "authenticated", user, tokens };
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      // The API client already cleared tokens via onAuthFailure → safe
      // to fall through, but we double-clear for the case where the
      // hooks weren't wired (paranoid: bootstrap must never leave the
      // store in a half-authenticated state).
      await deps.clearStoredTokens();
      return { kind: "expired" };
    }
    if (err instanceof NetworkError) {
      return { kind: "offline", tokens };
    }
    if (err instanceof ApiError && err.status >= 500) {
      // Server-side outage — same UX as offline. Keep tokens, render
      // optimistically, let subsequent calls surface the recovery.
      return { kind: "offline", tokens };
    }
    // Unknown error class (bug, panic) — treat as expired so the user
    // at least lands somewhere usable rather than seeing a frozen
    // splash screen forever.
    await deps.clearStoredTokens();
    return { kind: "expired" };
  }
}
