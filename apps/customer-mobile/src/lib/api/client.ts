import Constants from "expo-constants";

import { ApiError, AuthExpiredError, NetworkError, type ApiErrorBody } from "./errors";

import type { StoredTokens } from "../storage/secure-token-storage";

/**
 * Hooks the API client uses to read/write/clear tokens. Injected so the
 * client can be unit-tested without SecureStore or AuthContext, and so
 * AuthContext owns the persistence side of the contract.
 */
export interface ApiClientHooks {
  getTokens: () => Promise<StoredTokens | null>;
  setTokens: (tokens: StoredTokens) => Promise<void>;
  clearTokens: () => Promise<void>;
  /** Invoked exactly once per failed-refresh sequence. */
  onAuthFailure?: () => void;
}

export interface ApiClientOptions {
  baseUrl?: string;
  hooks: ApiClientHooks;
  /** Override for tests — defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface RequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  /** When true, no Authorization header is attached. Used by /auth/otp/* and refresh. */
  anonymous?: boolean;
  /** Internal — set by the 401-retry path so the second call doesn't infinite-loop. */
  _retried?: boolean;
}

/**
 * The refresh response shape — same as AuthTokens from shared-types but
 * we re-declare the subset the client needs instead of importing the
 * full Zod schema (the API client is intentionally schema-agnostic; the
 * auth.ts layer above this does shape validation).
 */
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

function defaultBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra = extra?.apiUrl;
  if (typeof fromExtra === "string" && fromExtra.length > 0) return fromExtra;
  return "http://localhost:3000";
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const { hooks } = options;

  // Single-flight refresh: when 5 in-flight requests all 401 at the same
  // time we want exactly one POST /auth/tokens/refresh, not five (each
  // refresh rotates the token, so racing refreshes invalidate each other
  // and the user gets logged out unnecessarily).
  //
  // The promise is kept in module scope of the closure so every retry
  // path through this client instance shares it. Resets back to null in
  // a finally{} so the next genuine 401 (after some idle time) starts a
  // fresh refresh.
  let pendingRefresh: Promise<StoredTokens | null> | null = null;

  async function performRefresh(refreshToken: string): Promise<StoredTokens | null> {
    if (pendingRefresh) return pendingRefresh;

    pendingRefresh = (async () => {
      try {
        const response = await fetchImpl(`${baseUrl}/auth/tokens/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return null;
        const fresh = (await response.json()) as RefreshResponse;
        const next: StoredTokens = {
          accessToken: fresh.accessToken,
          refreshToken: fresh.refreshToken,
          accessTokenExpiresAt: fresh.accessTokenExpiresAt,
          refreshTokenExpiresAt: fresh.refreshTokenExpiresAt,
        };
        await hooks.setTokens(next);
        return next;
      } catch {
        return null;
      } finally {
        pendingRefresh = null;
      }
    })();

    return pendingRefresh;
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    };

    if (!init.anonymous) {
      const tokens = await hooks.getTokens();
      if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    }

    const { body, anonymous: _anonymous, _retried, headers: _headers, ...rest } = init;
    void _anonymous;
    void _retried;
    void _headers;
    const fetchInit: RequestInit = {
      ...rest,
      headers,
    };
    if (body !== undefined) {
      fetchInit.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, fetchInit);
    } catch {
      throw new NetworkError();
    }

    if (response.status === 401 && !init.anonymous && !init._retried) {
      const stored = await hooks.getTokens();
      if (!stored) {
        throw new AuthExpiredError();
      }
      const refreshed = await performRefresh(stored.refreshToken);
      if (!refreshed) {
        await hooks.clearTokens();
        hooks.onAuthFailure?.();
        throw new AuthExpiredError();
      }
      // Replay the original request exactly once with the new token.
      return request<T>(path, { ...init, _retried: true });
    }

    if (!response.ok) {
      let body: ApiErrorBody = {};
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        // Non-JSON error body (gateway timeout HTML, empty 502, etc.)
      }
      throw new ApiError(response.status, body);
    }

    // 204 No Content — return undefined cast to T (caller types accordingly).
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    request,
    get baseUrl() {
      return baseUrl;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
