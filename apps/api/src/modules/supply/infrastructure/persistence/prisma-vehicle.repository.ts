import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateVehicleRow,
  VehicleRecord,
  VehicleRepositoryPort,
} from "../../application/ports/vehicle.repository.port";

@Injectable()
export class PrismaVehicleRepository implements VehicleRepositoryPort {
  async create(tx: TxClient, input: CreateVehicleRow): Promise<VehicleRecord> {
    const row = await tx.vehicle.create({
      data: {
        driverProfileId: input.driverProfileId,
        vehicleTypeId: input.vehicleTypeId,
        plateNumber: input.plateNumber,
        brand: input.brand,
        model: input.model,
        year: input.year,
        color: input.color,
        attributes: input.attributes as Prisma.InputJsonValue,
      },
    });
    return toRecord(row);
  }

  async findActiveById(tx: TxClient, id: string): Promise<VehicleRecord | null> {
    const row = await tx.vehicle.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async findActiveByPlate(tx: TxClient, plateNumber: string): Promise<VehicleRecord | null> {
    const row = await tx.vehicle.findFirst({ where: { plateNumber, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async listByDriver(tx: TxClient, driverProfileId: string): Promise<VehicleRecord[]> {
    const rows = await tx.vehicle.findMany({
      where: { driverProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toRecord);
  }

  async updateAttributes(
    tx: TxClient,
    id: string,
    expectedVersion: number,
    attributes: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await tx.vehicle.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        attributes: attributes as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }
}

function toRecord(
  row: Awaited<ReturnType<TxClient["vehicle"]["findFirstOrThrow"]>>,
): VehicleRecord {
  return {
    id: row.id,
    driverProfileId: row.driverProfileId,
    vehicleTypeId: row.vehicleTypeId,
    plateNumber: row.plateNumber,
    brand: row.brand,
    model: row.model,
    year: row.year,
    color: row.color,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    photoKeys: row.photoKeys,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
  };
}
