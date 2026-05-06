import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "../contexts/auth-context";

/**
 * Hook for screens to read auth state and call login/logout. Throws if
 * used outside <AuthProvider> — that's a programmer error and we want
 * a loud failure during dev rather than a silent null deref.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
