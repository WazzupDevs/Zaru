import type { TxClient } from "../../../../common/persistence/tx-client";

export const REFRESH_TOKEN_REPOSITORY_PORT = Symbol("REFRESH_TOKEN_REPOSITORY_PORT");

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface IssueRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshTokenRepositoryPort {
  issue(tx: TxClient, input: IssueRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByHash(tx: TxClient, tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Mark `oldId` revoked and link it to the replacement `newId`. */
  revokeAndLink(tx: TxClient, oldId: string, newId: string, revokedAt: Date): Promise<void>;
  /** Cascading revoke: every active token in a family. Returns the count revoked. */
  revokeFamily(tx: TxClient, familyId: string, revokedAt: Date): Promise<number>;
}
