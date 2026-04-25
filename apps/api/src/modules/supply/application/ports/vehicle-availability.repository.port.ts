import type { AvailabilityType } from "@event-fleet/shared-types";

import type { TxClient } from "../../../../common/persistence/tx-client";

export const VEHICLE_AVAILABILITY_REPOSITORY_PORT = Symbol("VEHICLE_AVAILABILITY_REPOSITORY_PORT");

export interface AvailabilityRecord {
  id: string;
  vehicleId: string;
  driverProfileId: string;
  startAt: Date;
  endAt: Date;
  type: AvailabilityType;
  bookingId: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface CreateAvailabilityRow {
  vehicleId: string;
  driverProfileId: string;
  startAt: Date;
  endAt: Date;
  type: AvailabilityType;
  reason?: string | undefined;
}

export interface VehicleAvailabilityRepositoryPort {
  create(tx: TxClient, input: CreateAvailabilityRow): Promise<AvailabilityRecord>;
  findActiveById(tx: TxClient, id: string): Promise<AvailabilityRecord | null>;
  /**
   * Half-open `[startAt, endAt)` overlap check.
   * Returns active rows that overlap the given range for the given vehicle,
   * optionally excluding one row id (used when updating an existing entry).
   */
  findOverlapping(
    tx: TxClient,
    vehicleId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<AvailabilityRecord[]>;
  listForVehicle(
    tx: TxClient,
    vehicleId: string,
    args: { from?: Date | undefined; to?: Date | undefined },
  ): Promise<AvailabilityRecord[]>;
  softDelete(tx: TxClient, id: string, deletedAt: Date): Promise<void>;
}
