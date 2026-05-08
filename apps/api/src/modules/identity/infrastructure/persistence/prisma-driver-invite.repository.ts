import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../common/prisma/prisma.service";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateDriverInviteInput,
  DriverInviteRecord,
  DriverInviteRepositoryPort,
  ListDriverInvitesQuery,
} from "../../application/ports/driver-invite.repository.port";

@Injectable()
export class PrismaDriverInviteRepository implements DriverInviteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByPhoneHash(
    tx: TxClient,
    phoneE164Hash: string,
  ): Promise<DriverInviteRecord | null> {
    // The whitelist check needs to find PENDING and ACCEPTED rows
    // (REVOKED/soft-deleted excluded). The hash+status index covers
    // the lookup; status filter applied here so the use case can
    // distinguish PENDING vs ACCEPTED.
    const row = await tx.driverInvite.findFirst({
      where: { phoneE164Hash, deletedAt: null },
      orderBy: { invitedAt: "desc" },
    });
    return row ? toRecord(row) : null;
  }

  async findById(tx: TxClient, id: string): Promise<DriverInviteRecord | null> {
    const row = await tx.driverInvite.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async create(tx: TxClient, input: CreateDriverInviteInput): Promise<DriverInviteRecord> {
    const row = await tx.driverInvite.create({
      data: {
        phoneE164: input.phoneE164,
        phoneE164Hash: input.phoneE164Hash,
        invitedByAdminId: input.invitedByAdminId,
        notes: input.notes,
      },
    });
    return toRecord(row);
  }

  async markAccepted(
    tx: TxClient,
    input: { id: string; acceptedUserId: string; acceptedAt: Date },
  ): Promise<DriverInviteRecord | null> {
    // Atomic PENDING → ACCEPTED. updateMany returns count 0 if the
    // row already moved (race) — we surface null so the caller can
    // choose the recovery path.
    const updateCount = await tx.driverInvite.updateMany({
      where: { id: input.id, status: "PENDING", deletedAt: null },
      data: {
        status: "ACCEPTED",
        acceptedAt: input.acceptedAt,
        acceptedUserId: input.acceptedUserId,
      },
    });
    if (updateCount.count === 0) return null;
    const row = await tx.driverInvite.findUniqueOrThrow({ where: { id: input.id } });
    return toRecord(row);
  }

  async markRevoked(tx: TxClient, id: string, at: Date): Promise<DriverInviteRecord | null> {
    const updateCount = await tx.driverInvite.updateMany({
      where: { id, status: "PENDING", deletedAt: null },
      data: { status: "REVOKED", deletedAt: at },
    });
    if (updateCount.count === 0) return null;
    const row = await tx.driverInvite.findUniqueOrThrow({ where: { id } });
    return toRecord(row);
  }

  async list(tx: TxClient, query: ListDriverInvitesQuery): Promise<DriverInviteRecord[]> {
    const rows = await tx.driverInvite.findMany({
      where: {
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { invitedAt: "desc" },
      take: query.limit ?? 50,
    });
    return rows.map(toRecord);
  }

  // The PrismaService is unused at the field level (we receive a tx);
  // this keeps the DI shape consistent with the other repos.
  private _unused(): void {
    void this.prisma;
  }
}

interface DriverInviteRow {
  id: string;
  phoneE164: string;
  phoneE164Hash: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  invitedAt: Date;
  acceptedAt: Date | null;
  acceptedUserId: string | null;
  invitedByAdminId: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: DriverInviteRow): DriverInviteRecord {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    phoneE164Hash: row.phoneE164Hash,
    status: row.status,
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
    acceptedUserId: row.acceptedUserId,
    invitedByAdminId: row.invitedByAdminId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
