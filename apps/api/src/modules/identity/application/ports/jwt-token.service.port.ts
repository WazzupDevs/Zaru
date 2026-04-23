import type { UserRole } from "@event-fleet/shared-types";

export const JWT_TOKEN_SERVICE_PORT = Symbol("JWT_TOKEN_SERVICE_PORT");

export interface AccessTokenClaims {
  /** Subject — User.id (UUID). */
  sub: string;
  role: UserRole;
  /** Optional request id captured at sign time, for log correlation. */
  requestId?: string;
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface RefreshTokenSecret {
  /** Plaintext (returned to client only — never logged or persisted raw). */
  plaintext: string;
  /** Stored on the refresh_tokens row. */
  hash: string;
  expiresAt: Date;
}

/**
 * Boundary between the use case and the JWT/cryptography concerns.
 * Lets us swap HS256 for ES256 (ADR 0008 follow-up) or change refresh
 * encoding without rippling through application code.
 */
export interface JwtTokenServicePort {
  signAccess(claims: AccessTokenClaims, now: Date): SignedAccessToken;
  verifyAccess(token: string): AccessTokenClaims;
  generateRefresh(now: Date): RefreshTokenSecret;
  hashRefresh(plaintext: string): string;
}
