/**
 * Mobile-side API error hierarchy. The shape mirrors the API's
 * `error-response.ts` envelope so screens can branch on `code` for
 * Turkish error copy without parsing strings.
 *
 * NetworkError vs ApiError: NetworkError is "couldn't reach the API"
 * (offline, DNS, TLS, timeout). ApiError is "API responded with a
 * non-2xx status". Distinct types because the recovery UX differs —
 * NetworkError shows "tekrar dene", ApiError shows the server's message.
 */
export class NetworkError extends Error {
  constructor(message = "Sunucuya ulaşılamıyor") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody = {}) {
    super(body.message ?? `Request failed with status ${String(status)}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

/**
 * Thrown when refresh fails during a 401 retry path. The caller
 * (AuthContext) listens for this to log the user out and bounce them
 * back to the phone-entry screen.
 */
export class AuthExpiredError extends Error {
  constructor() {
    super("Oturum süresi doldu, tekrar giriş yapın");
    this.name = "AuthExpiredError";
  }
}
