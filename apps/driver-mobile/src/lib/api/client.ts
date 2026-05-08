// 1:1 copy of apps/customer-mobile/src/lib/api/client.ts — single-flight
// refresh + 401 retry + typed error envelope. Refresh endpoint
// (/auth/tokens/refresh) is shared between customer and driver auth, so
// the client doesn't need a driver-specific path. A4f-3 may extract this
// into packages/mobile-shared if a third app shows up.

import Constants from "expo-constants";

import { ApiError, AuthExpiredError, NetworkError, type ApiErrorBody } from "./errors";

import type { StoredTokens } from "../storage/secure-token-storage";

export interface ApiClientHooks {
  getTokens: () => Promise<StoredTokens | null>;
  setTokens: (tokens: StoredTokens) => Promise<void>;
  clearTokens: () => Promise<void>;
  onAuthFailure?: () => void;
}

export interface ApiClientOptions {
  baseUrl?: string;
  hooks: ApiClientHooks;
  fetchImpl?: typeof fetch;
}

interface RequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  anonymous?: boolean;
  _retried?: boolean;
}

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
    const fetchInit: RequestInit = { ...rest, headers };
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
      return request<T>(path, { ...init, _retried: true });
    }

    if (!response.ok) {
      let body: ApiErrorBody = {};
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        // Non-JSON error body — preserve status, leave code undefined.
      }
      throw new ApiError(response.status, body);
    }

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
