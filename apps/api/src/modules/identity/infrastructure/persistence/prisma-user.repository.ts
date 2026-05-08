import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../common/prisma/prisma.service";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { UserRecord, UserRepositoryPort } from "../../application/ports/user.repository.port";

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  /** Active = not soft-deleted. The soft-delete extension would auto-filter
   * findFirst, but we read against `tx` (the raw transaction client, no
   * extension), so we add the filter explicitly. See development-notes.md. */
  async findActiveByPhone(tx: TxClient, phoneE164: string): Promise<UserRecord | null> {
    const row = await tx.user.findFirst({
      where: { phoneE164, deletedAt: null },
    });
    return row ? toRecord(row) : null;
  }

  async findActiveById(tx: TxClient, id: string): Promise<UserRecord | null> {
    const row = await tx.user.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? toRecord(row) : null;
  }

  async createVerified(
    tx: TxClient,
    input: { phoneE164: string; verifiedAt: Date; loggedInAt: Date },
  ): Promise<UserRecord> {
    const created = await tx.user.create({
      data: {
        phoneE164: input.phoneE164,
        // role defaults to CUSTOMER at the schema layer
        phoneVerifiedAt: input.verifiedAt,
        lastLoginAt: input.loggedInAt,
      },
    });
    return toRecord(created);
  }

  async touchLastLogin(tx: TxClient, userId: string, loggedInAt: Date): Promise<void> {
    await tx.user.update({
      where: { id: userId },
      data: { lastLoginAt: loggedInAt },
    });
  }

  async updatePushToken(
    tx: TxClient,
    params: { userId: string; expoPushToken: string | null; at: Date },
  ): Promise<void> {
    await tx.user.update({
      where: { id: params.userId },
      data: {
        expoPushToken: params.expoPushToken,
        pushTokenUpdatedAt: params.at,
      },
    });
  }

  /** This service exists only to satisfy DI; PrismaService is the real source. */

  private _unused(): void {
    void this.prisma;
  }
}

interface UserRow {
  id: string;
  phoneE164: string;
  displayName: string | null;
  role: "CUSTOMER" | "DRIVER" | "ADMIN" | "SUPPORT";
  phoneVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  expoPushToken: string | null;
  pushTokenUpdatedAt: Date | null;
  createdAt: Date;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    displayName: row.displayName,
    role: row.role,
    phoneVerifiedAt: row.phoneVerifiedAt,
    lastLoginAt: row.lastLoginAt,
    expoPushToken: row.expoPushToken,
    pushTokenUpdatedAt: row.pushTokenUpdatedAt,
    createdAt: row.createdAt,
  };
}
