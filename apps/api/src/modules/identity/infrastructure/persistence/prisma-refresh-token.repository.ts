import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../common/prisma/prisma.service";

import type {
  IssueRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepositoryPort,
} from "../../application/ports/refresh-token.repository.port";
import type { TxClient } from "../../application/ports/user.repository.port";

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async issue(tx: TxClient, input: IssueRefreshTokenInput): Promise<RefreshTokenRecord> {
    const created = await tx.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
        ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      },
    });
    return toRecord(created);
  }

  async findByHash(tx: TxClient, tokenHash: string): Promise<RefreshTokenRecord | null> {
    // findUnique is safe here: we WANT to see revoked tokens (reuse detection
    // path checks revokedAt). Soft-deletion is handled at use case level.
    const row = await tx.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toRecord(row) : null;
  }

  async revokeAndLink(tx: TxClient, oldId: string, newId: string, revokedAt: Date): Promise<void> {
    await tx.refreshToken.update({
      where: { id: oldId },
      data: { revokedAt, replacedById: newId },
    });
  }

  async revokeFamily(tx: TxClient, familyId: string, revokedAt: Date): Promise<number> {
    const result = await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }

  private _unused(): void {
    void this.prisma;
  }
}

interface RefreshRow {
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

function toRecord(row: RefreshRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}
