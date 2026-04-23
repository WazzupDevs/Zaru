/**
 * Security-critical event. Emitted when a revoked refresh token is replayed.
 * Use case revokes the entire family before emitting this. Downstream
 * consumers should alert/log/notify the user.
 */
export interface RefreshReuseDetectedEventPayload {
  userId: string;
  familyId: string;
  // The replayed (already-revoked) token's id.
  replayedTokenId: string;
  detectedAt: string; // ISO-8601
  ipAddress?: string;
  userAgent?: string;
}

export const REFRESH_REUSE_DETECTED_EVENT_TYPE = "identity.RefreshReuseDetected";
