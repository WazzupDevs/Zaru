import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createAuthApi, type AuthApi, type AuthUserSummary } from "../lib/api/auth";
import { createApiClient, type ApiClient } from "../lib/api/client";
import { bootstrapAuth, type BootstrapResult } from "../lib/auth/bootstrap";
import {
  clearTokens as clearStoredTokens,
  getTokens as getStoredTokens,
  setTokens as setStoredTokens,
  type StoredTokens,
} from "../lib/storage/secure-token-storage";

/**
 * Auth state machine — three observable states:
 *
 *   bootstrapping
 *     Cold start in flight. Render the splash screen. Routes are not
 *     yet allowed to redirect.
 *
 *   unauthenticated
 *     Either no tokens were stored, or refresh failed mid-session.
 *     Routes redirect to (auth)/phone.
 *
 *   authenticated
 *     getMe() succeeded OR we're optimistically authenticated from a
 *     stored session that we couldn't verify yet (offline cold start).
 *     `verified` flag distinguishes the two so the home screen can
 *     show an "offline — bağlantı bekleniyor" banner if it wants.
 */
export type AuthState =
  | { status: "bootstrapping" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthUserSummary; verified: boolean };

export interface AuthContextValue {
  state: AuthState;
  authApi: AuthApi;
  /** Called from VerifyOtpScreen after successful otp/verify. */
  login: (tokens: StoredTokens, user: AuthUserSummary) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "bootstrapping" });

  // The API client + authApi must be stable across renders so screens
  // memoising on them don't churn. They also need a callback into our
  // setState (for the onAuthFailure path), which is why we build them
  // here rather than at module scope.
  const stateRef = useRef<AuthState>(state);
  stateRef.current = state;

  const apiClient: ApiClient = useMemo(
    () =>
      createApiClient({
        hooks: {
          getTokens: getStoredTokens,
          setTokens: setStoredTokens,
          clearTokens: clearStoredTokens,
          onAuthFailure: () => {
            // Forced logout from inside the API client (refresh failed).
            // Only transition if we're currently considered authenticated;
            // bootstrapping/unauthenticated already handle this themselves.
            if (stateRef.current.status === "authenticated") {
              setState({ status: "unauthenticated" });
            }
          },
        },
      }),
    [],
  );

  const authApi: AuthApi = useMemo(() => createAuthApi(apiClient), [apiClient]);

  // Cold-start bootstrap. Runs exactly once per app process.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result: BootstrapResult = await bootstrapAuth({
        getStoredTokens,
        clearStoredTokens,
        authApi,
      });
      // ESLint can't see across the closure boundary that `cancelled` is
      // mutated by the cleanup callback below, so it flags this as
      // always-false. The check is real — without it a fast unmount
      // (e.g., HMR) would setState on an unmounted provider.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelled) return;
      switch (result.kind) {
        case "no-session":
        case "expired":
        case "offline":
          // Offline path: bootstrap couldn't reach the API to fetch the
          // user summary, so we have nothing to render in the (app) tree.
          // For G4 we degrade to unauthenticated; A4d-2 caches the user
          // alongside tokens so offline cold-starts can render the home
          // screen optimistically.
          setState({ status: "unauthenticated" });
          break;
        case "authenticated":
          setState({ status: "authenticated", user: result.user, verified: true });
          break;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authApi]);

  const login = useCallback(async (tokens: StoredTokens, user: AuthUserSummary) => {
    await setStoredTokens(tokens);
    setState({ status: "authenticated", user, verified: true });
  }, []);

  const logout = useCallback(async () => {
    await clearStoredTokens();
    setState({ status: "unauthenticated" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, authApi, login, logout }),
    [state, authApi, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
