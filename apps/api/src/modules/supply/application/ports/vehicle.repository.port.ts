import type { VehicleStatus } from "@event-fleet/shared-types";

import type { TxClient } from "../../../../common/persistence/tx-client";

export const VEHICLE_REPOSITORY_PORT = Symbol("VEHICLE_REPOSITORY_PORT");

export interface VehicleRecord {
  id: string;
  driverProfileId: string;
  vehicleTypeId: string;
  plateNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  attributes: Record<string, unknown>;
  photoKeys: string[];
  status: VehicleStatus;
  version: number;
  createdAt: Date;
}

export interface CreateVehicleRow {
  driverProfileId: string;
  vehicleTypeId: string;
  plateNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  attributes: Record<string, unknown>;
}

export interface VehicleRepositoryPort {
  create(tx: TxClient, input: CreateVehicleRow): Promise<VehicleRecord>;
  findActiveById(tx: TxClient, id: string): Promise<VehicleRecord | null>;
  findActiveByPlate(tx: TxClient, plateNumber: string): Promise<VehicleRecord | null>;
  listByDriver(tx: TxClient, driverProfileId: string): Promise<VehicleRecord[]>;
  /**
   * Optimistic-lock update of attributes. Returns true if the update hit
   * (version matched), false if the row was concurrently modified.
   */
  updateAttributes(
    tx: TxClient,
    id: string,
    expectedVersion: number,
    attributes: Record<string, unknown>,
  ): Promise<boolean>;
  setStatus(tx: TxClient, id: string, status: VehicleStatus): Promise<void>;
}
