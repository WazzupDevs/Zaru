import { Injectable } from "@nestjs/common";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  AvailabilityRecord,
  CreateAvailabilityRow,
  VehicleAvailabilityRepositoryPort,
} from "../../application/ports/vehicle-availability.repository.port";

@Injectable()
export class PrismaVehicleAvailabilityRepository implements VehicleAvailabilityRepositoryPort {
  async create(tx: TxClient, input: CreateAvailabilityRow): Promise<AvailabilityRecord> {
    const row = await tx.vehicleAvailability.create({
      data: {
        vehicleId: input.vehicleId,
        driverProfileId: input.driverProfileId,
        startAt: input.startAt,
        endAt: input.endAt,
        type: input.type,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    });
    return toRecord(row);
  }

  async findActiveById(tx: TxClient, id: string): Promise<AvailabilityRecord | null> {
    const row = await tx.vehicleAvailability.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async findOverlapping(
    tx: TxClient,
    vehicleId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<AvailabilityRecord[]> {
    // Half-open `[startAt, endAt)` overlap rule:
    //   existing.startAt < requested.endAt  AND  existing.endAt > requested.startAt
    // Adjacent ranges (existing.endAt == requested.startAt) intentionally do NOT overlap.
    const rows = await tx.vehicleAvailability.findMany({
      where: {
        vehicleId,
        deletedAt: null,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
      orderBy: { startAt: "asc" },
    });
    return rows.map(toRecord);
  }

  async listForVehicle(
    tx: TxClient,
    vehicleId: string,
    args: { from?: Date | undefined; to?: Date | undefined },
  ): Promise<AvailabilityRecord[]> {
    const rows = await tx.vehicleAvailability.findMany({
      where: {
        vehicleId,
        deletedAt: null,
        ...(args.from !== undefined ? { endAt: { gt: args.from } } : {}),
        ...(args.to !== undefined ? { startAt: { lt: args.to } } : {}),
      },
      orderBy: { startAt: "asc" },
    });
    return rows.map(toRecord);
  }

  async softDelete(tx: TxClient, id: string, deletedAt: Date): Promise<void> {
    await tx.vehicleAvailability.update({ where: { id }, data: { deletedAt } });
  }
}

function toRecord(
  row: Awaited<ReturnType<TxClient["vehicleAvailability"]["findFirstOrThrow"]>>,
): AvailabilityRecord {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    driverProfileId: row.driverProfileId,
    startAt: row.startAt,
    endAt: row.endAt,
    type: row.type,
    bookingId: row.bookingId,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}
