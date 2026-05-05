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
  /** Required for type=BOOKED so Dispatch can later locate the row to soft-delete on reassign. */
  bookingId?: string | undefined;
  reason?: string | undefined;
}

export interface VehicleAvailabilityRepositoryPort {
  create(tx: TxClient, input: CreateAvailabilityRow): Promise<AvailabilityRecord>;
  findActiveById(tx: TxClient, id: string): Promise<AvailabilityRecord | null>;
  /**
   * Locate the BOOKED row Dispatch wrote when a booking was assigned —
   * used by ManualReassign to soft-delete the old reservation before
   * inserting the new one.
   */
  findBookedForBooking(tx: TxClient, bookingId: string): Promise<AvailabilityRecord | null>;
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
