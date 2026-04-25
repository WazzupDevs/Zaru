/**
 * Browser-side API client. localStorage-backed token storage is OK for the
 * MVP admin shell (single-tab, single-user flow); production-grade auth
 * (httpOnly cookie + CSRF) lands in A4 alongside the customer mobile flow.
 */
const ACCESS_KEY = "ef.admin.access_token";
const REFRESH_KEY = "ef.admin.refresh_token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface ApiError {
  status: number;
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiClient {
  static accessToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACCESS_KEY);
  }
  static refreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(REFRESH_KEY);
  }
  static setTokens(access: string, refresh: string): void {
    window.localStorage.setItem(ACCESS_KEY, access);
    window.localStorage.setItem(REFRESH_KEY, refresh);
  }
  static clearTokens(): void {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  }

  static async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extra?: { headers?: Record<string, string>; auth?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (extra?.auth !== false) {
      const token = ApiClient.accessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (extra?.headers) Object.assign(headers, extra.headers);

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        payload = await res.text();
      }
      const err: ApiError = { status: res.status };
      if (payload !== null && typeof payload === "object") {
        const p = payload as { code?: string; message?: string; details?: unknown };
        if (p.code !== undefined) err.code = p.code;
        if (p.message !== undefined) err.message = p.message;
        if (p.details !== undefined) err.details = p.details;
      }
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  static get<T>(path: string, extra?: { headers?: Record<string, string>; auth?: boolean }) {
    return ApiClient.request<T>("GET", path, undefined, extra);
  }
  static post<T>(
    path: string,
    body?: unknown,
    extra?: { headers?: Record<string, string>; auth?: boolean },
  ) {
    return ApiClient.request<T>("POST", path, body, extra);
  }
  static delete<T>(path: string, extra?: { headers?: Record<string, string>; auth?: boolean }) {
    return ApiClient.request<T>("DELETE", path, undefined, extra);
  }
}
