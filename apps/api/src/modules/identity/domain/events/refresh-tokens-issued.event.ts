/**
 * Emitted when a refresh token is issued — both for fresh login (first
 * token in a family) and rotation (replacement within an existing family).
 * Token plaintext NEVER enters the payload.
 */
export interface RefreshTokensIssuedEventPayload {
  userId: string;
  refreshTokenId: string;
  familyId: string;
  // Set when rotating; null/omitted on the family's first token.
  replacedTokenId?: string;
  issuedAt: string; // ISO-8601
  expiresAt: string; // ISO-8601
  ipAddress?: string;
  userAgent?: string;
}

export const REFRESH_TOKENS_ISSUED_EVENT_TYPE = "identity.RefreshTokensIssued";
