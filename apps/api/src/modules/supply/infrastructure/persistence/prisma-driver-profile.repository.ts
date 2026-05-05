import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { DriverOnboardingStatus } from "@event-fleet/shared-types";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateDriverProfileRow,
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../../application/ports/driver-profile.repository.port";

@Injectable()
export class PrismaDriverProfileRepository implements DriverProfileRepositoryPort {
  async create(tx: TxClient, input: CreateDriverProfileRow): Promise<DriverProfileRecord> {
    const created = await tx.driverProfile.create({
      data: {
        userId: input.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        nationalIdHash: input.nationalIdHash,
        birthDate: input.birthDate,
        ibanHash: input.ibanHash,
        ibanLast4: input.ibanLast4,
      },
    });
    return toRecord(created);
  }

  async findActiveByUserId(tx: TxClient, userId: string): Promise<DriverProfileRecord | null> {
    const row = await tx.driverProfile.findFirst({ where: { userId, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async findActiveById(tx: TxClient, id: string): Promise<DriverProfileRecord | null> {
    const row = await tx.driverProfile.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async findByNationalIdHash(tx: TxClient, hash: string): Promise<DriverProfileRecord | null> {
    const row = await tx.driverProfile.findFirst({
      where: { nationalIdHash: hash, deletedAt: null },
    });
    return row ? toRecord(row) : null;
  }

  async updateBasics(
    tx: TxClient,
    id: string,
    input: { firstName?: string; lastName?: string },
  ): Promise<void> {
    await tx.driverProfile.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      },
    });
  }

  async setStatus(
    tx: TxClient,
    id: string,
    next: {
      status: DriverOnboardingStatus;
      rejectionReason?: string | null;
      approvedAt?: Date | null;
      approvedByUserId?: string | null;
    },
  ): Promise<void> {
    await tx.driverProfile.update({
      where: { id },
      data: {
        status: next.status,
        ...(next.rejectionReason !== undefined ? { rejectionReason: next.rejectionReason } : {}),
        ...(next.approvedAt !== undefined ? { approvedAt: next.approvedAt } : {}),
        ...(next.approvedByUserId !== undefined ? { approvedByUserId: next.approvedByUserId } : {}),
        version: { increment: 1 },
      },
    });
  }

  async updateLocation(
    tx: TxClient,
    driverProfileId: string,
    input: { lat: string | number; lng: string | number; updatedAt: Date },
  ): Promise<boolean> {
    const result = await tx.driverProfile.updateMany({
      where: { id: driverProfileId, deletedAt: null },
      data: {
        lastKnownLat: new Prisma.Decimal(input.lat),
        lastKnownLng: new Prisma.Decimal(input.lng),
        lastLocationUpdate: input.updatedAt,
      },
    });
    return result.count > 0;
  }

  async setOnline(tx: TxClient, driverProfileId: string, isOnline: boolean): Promise<boolean> {
    const result = await tx.driverProfile.updateMany({
      where: { id: driverProfileId, deletedAt: null },
      data: { isOnline },
    });
    return result.count > 0;
  }

  async listPending(
    tx: TxClient,
    args: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: DriverProfileRecord[]; nextCursor: string | null }> {
    const rows = await tx.driverProfile.findMany({
      where: { status: "DOCUMENTS_PENDING", deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: args.limit + 1,
      ...(args.cursor !== undefined ? { skip: 1, cursor: { id: args.cursor } } : {}),
    });
    const hasMore = rows.length > args.limit;
    const slice = hasMore ? rows.slice(0, args.limit) : rows;
    const tail = slice[slice.length - 1];
    return {
      items: slice.map(toRecord),
      nextCursor: hasMore && tail ? tail.id : null,
    };
  }
}

function toRecord(
  row: Awaited<ReturnType<TxClient["driverProfile"]["findFirstOrThrow"]>>,
): DriverProfileRecord {
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    nationalIdHash: row.nationalIdHash,
    birthDate: row.birthDate,
    ibanHash: row.ibanHash,
    ibanLast4: row.ibanLast4,
    status: row.status,
    rejectionReason: row.rejectionReason,
    approvedAt: row.approvedAt,
    approvedByUserId: row.approvedByUserId,
    commissionRate: row.commissionRate.toString(),
    version: row.version,
    createdAt: row.createdAt,
  };
}
