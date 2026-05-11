import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { driverAuthApi } from "../lib/api";
import { type AuthUserSummary, type DriverAuthApi } from "../lib/api/driver-auth";
import { bootstrapAuth, validateSession } from "../lib/auth/bootstrap";
import {
  clearSession,
  getSession,
  setSession,
  type StoredTokens,
} from "../lib/storage/secure-token-storage";

/**
 * Driver-app auth state machine. Same shape as customer-mobile's
 * AuthContext (bootstrapping → unauthenticated → authenticated) so
 * future shared-mobile extraction stays mechanical. The wrong-role
 * path is the only material divergence — bootstrap surfaces it as
 * `expired` so we wipe + bounce to phone entry.
 */
export type AuthState =
  | { status: "bootstrapping" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthUserSummary; verified: boolean };

export interface AuthContextValue {
  state: AuthState;
  authApi: DriverAuthApi;
  login: (tokens: StoredTokens, user: AuthUserSummary) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "bootstrapping" });
  const stateRef = useRef<AuthState>(state);
  stateRef.current = state;

  const authApi = useMemo(() => driverAuthApi, []);

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

      const validated = await validateSession({ authApi, cachedUser: cold.session.user });
      // ESLint can't see across the await + closure that the cleanup
      // callback calls controller.abort() — flag is suppressed for the
      // same reason as customer-mobile's AuthProvider.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) return;

      if (validated.kind === "expired") {
        await clearSession();
        setState({ status: "unauthenticated" });
        return;
      }

      if (validated.kind === "offline") return;

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
    // A4f-1b wires push registration here (mirrors A4e-3 customer flow).
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setState({ status: "unauthenticated" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, authApi, login, logout }),
    [state, authApi, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
