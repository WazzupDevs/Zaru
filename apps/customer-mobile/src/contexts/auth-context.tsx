import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usersApi } from "../lib/api";
import { createAuthApi, type AuthApi, type AuthUserSummary } from "../lib/api/auth";
import { createApiClient, type ApiClient } from "../lib/api/client";
import { bootstrapAuth, validateSession } from "../lib/auth/bootstrap";
import { Logger } from "../lib/logger";
import { PushTokenService } from "../lib/push/push-token-service";
import {
  clearSession,
  getSession,
  getTokens,
  setSession,
  setTokens,
  type StoredTokens,
} from "../lib/storage/secure-token-storage";

/**
 * Best-effort push registration after a successful OTP verify. Walks
 * the permission flow, gets the Expo token, PATCHes it to /users/me/
 * push-token. Every failure mode (no device, no permission, network
 * error, placeholder projectId) logs + swallows — the auth flow
 * already succeeded by the time we get here.
 */
async function registerPushToken(): Promise<void> {
  try {
    const token = await PushTokenService.requestPermissionAndGetToken();
    if (!token) return; // Soft-null path — Service already logged the reason.
    await usersApi.updatePushToken(token);
    Logger.info("push_registration_success");
  } catch (err) {
    Logger.warn("push_registration_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Auth state machine — three observable states:
 *
 *   bootstrapping
 *     The initial SecureStore read is in flight (microsecond window).
 *     Render the splash screen. Routes are not yet allowed to redirect.
 *
 *   unauthenticated
 *     No cached session OR background validate returned `expired`.
 *     Routes redirect to (auth)/phone.
 *
 *   authenticated
 *     We have a user object to render. `verified` distinguishes:
 *       false → cached, background `/auth/me` still in flight (or it
 *               came back `offline`, in which case we keep showing the
 *               cached UI and hope the next call succeeds).
 *       true  → server confirmed the session and the user object is
 *               either unchanged or freshly synced from the API.
 *     Screens that want to show an "offline — bağlantı bekleniyor"
 *     badge can read this flag.
 */
export type AuthState =
  | { status: "bootstrapping" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthUserSummary; verified: boolean };

export interface AuthContextValue {
  state: AuthState;
  authApi: AuthApi;
  /** Called from VerifyOtpScreen after a successful otp/verify. */
  login: (tokens: StoredTokens, user: AuthUserSummary) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "bootstrapping" });
  const stateRef = useRef<AuthState>(state);
  stateRef.current = state;

  const apiClient: ApiClient = useMemo(
    () =>
      createApiClient({
        hooks: {
          getTokens,
          setTokens,
          clearTokens: clearSession,
          onAuthFailure: () => {
            if (stateRef.current.status === "authenticated") {
              setState({ status: "unauthenticated" });
            }
          },
        },
      }),
    [],
  );

  const authApi: AuthApi = useMemo(() => createAuthApi(apiClient), [apiClient]);

  // AbortController instead of a manual flag — ESLint can't statically
  // prove `signal.aborted` stays false across the await boundary, so it
  // skips the no-unnecessary-condition warning that a `let cancelled`
  // pattern triggers. The check is real: prevents setState on an
  // unmounted provider during fast HMR cycles.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    void (async () => {
      const cold = await bootstrapAuth({ getStoredSession: getSession });
      if (signal.aborted) return;

      if (cold.kind === "no-session") {
        setState({ status: "unauthenticated" });
        return;
      }

      setState({ status: "authenticated", user: cold.session.user, verified: false });

      // Background validate. The API client's 401 auto-refresh sits
      // between this call and the network; we only see AuthExpiredError
      // if refresh itself died.
      const validated = await validateSession({ authApi, cachedUser: cold.session.user });
      // ESLint can't see across the await + closure that the cleanup
      // callback calls controller.abort() — so it flags this read as
      // always-false. The check is real (prevents setState on an
      // unmounted provider during HMR).
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) return;

      if (validated.kind === "expired") {
        await clearSession();
        setState({ status: "unauthenticated" });
        return;
      }

      if (validated.kind === "offline") {
        // Keep the cached state — verified stays false. Future API calls
        // will surface the real status.
        return;
      }

      // valid: persist if the user object actually changed (avoid a
      // no-op SecureStore write + state churn on every cold start).
      if (validated.userChanged) {
        await setSession({ tokens: cold.session.tokens, user: validated.user });
      }
      setState({ status: "authenticated", user: validated.user, verified: true });
    })();

    return () => {
      controller.abort();
    };
  }, [authApi]);

  const login = useCallback(async (tokens: StoredTokens, user: AuthUserSummary) => {
    await setSession({ tokens, user });
    setState({ status: "authenticated", user, verified: true });

    // Push registration — fire-and-forget. A NetworkError, denied
    // permission, or placeholder projectId all return null silently;
    // anything else throws and we swallow + log so the auth flow
    // never breaks because of push. The token gets PATCHed to
    // /users/me/push-token; the backend stores it on the User row +
    // the listener picks PUSH on the next outbox event.
    void registerPushToken();
  }, []);

  const logout = useCallback(async () => {
    // Best-effort token clear on the server. Failure here is harmless
    // — the session is already gone client-side, the worst case is a
    // stale token sticks around on the User row and the next push
    // dies with DeviceNotRegistered (cleanup loop handles that in A4g).
    try {
      await usersApi.updatePushToken(null);
    } catch (err) {
      Logger.warn("push_token_clear_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    await clearSession();
    setState({ status: "unauthenticated" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, authApi, login, logout }),
    [state, authApi, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
