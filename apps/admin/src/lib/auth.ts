"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClient } from "./api-client";

export interface AuthUser {
  id: string;
  phoneE164: string;
  role: "CUSTOMER" | "DRIVER" | "ADMIN" | "SUPPORT";
  displayName: string | null;
}

/**
 * Hook for authenticated pages — redirects to /login if no token, then
 * verifies the token by hitting /auth/me. Forwards 401s to /login as well.
 * Caller can pass `requireRole: "ADMIN"` to gate admin-only screens.
 */
export function useRequireAuth(opts?: { requireRole?: AuthUser["role"] }): {
  user: AuthUser | null;
  loading: boolean;
} {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const token = ApiClient.accessToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      try {
        const me = await ApiClient.get<AuthUser>("/auth/me");
        if (cancelled) return;
        if (opts?.requireRole !== undefined && me.role !== opts.requireRole) {
          ApiClient.clearTokens();
          router.replace("/login?reason=forbidden");
          return;
        }
        setUser(me);
      } catch {
        ApiClient.clearTokens();
        router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [router, opts?.requireRole]);

  return { user, loading };
}

export function logout(router: ReturnType<typeof useRouter>): void {
  ApiClient.clearTokens();
  router.replace("/login");
}
