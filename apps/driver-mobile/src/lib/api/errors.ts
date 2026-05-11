/**
 * Error hierarchy mirrors apps/customer-mobile/src/lib/api/errors.ts —
 * NetworkError vs ApiError vs AuthExpiredError. Driver app surfaces an
 * extra meaning via the ApiError.code (`DRIVER_NOT_INVITED`,
 * `INVALID_PUSH_TOKEN`, etc.); the type itself stays the same shape so
 * future shared-mobile extraction stays mechanical.
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

export class AuthExpiredError extends Error {
  constructor() {
    super("Oturum süresi doldu, tekrar giriş yapın");
    this.name = "AuthExpiredError";
  }
}

/**
 * Driver app raises this when the OTP verify response carries a role
 * other than DRIVER (Zod literal parse fail). Distinct error so the UI
 * can show "Bu hesap sürücü girişi için uygun değil — müşteri
 * uygulamasını kullanın" rather than a generic shape error.
 */
export class WrongAppRoleError extends Error {
  constructor() {
    super("Bu hesap sürücü girişi için uygun değil — müşteri uygulamasını kullanın");
    this.name = "WrongAppRoleError";
  }
}
