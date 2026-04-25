import { Inject, Injectable } from "@nestjs/common";

import type { CheckVehicleFreeResponse } from "@event-fleet/shared-types";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { InvalidAvailabilityRangeError } from "../../domain/errors/availability-errors";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  VEHICLE_AVAILABILITY_REPOSITORY_PORT,
  type VehicleAvailabilityRepositoryPort,
} from "../ports/vehicle-availability.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRepositoryPort,
} from "../ports/vehicle.repository.port";

export interface CheckVehicleFreeInput {
  vehicleId: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Public availability check. Booking flow (A4) will call this before
 * proposing a quote. No auth — vehicle calendars are not secret; the
 * data returned only reveals "this slot is busy", never who or why.
 */
@Injectable()
export class CheckVehicleFreeUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(VEHICLE_AVAILABILITY_REPOSITORY_PORT)
    private readonly availRepo: VehicleAvailabilityRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(input: CheckVehicleFreeInput): Promise<CheckVehicleFreeResponse> {
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      throw new InvalidAvailabilityRangeError();
    }

    return this.tx.run(async (tx) => {
      const vehicle = await this.vehicleRepo.findActiveById(tx, input.vehicleId);
      if (!vehicle) throw new VehicleNotFoundError();

      const conflicts = await this.availRepo.findOverlapping(
        tx,
        input.vehicleId,
        input.startAt,
        input.endAt,
      );
      return {
        free: conflicts.length === 0,
        conflicts: conflicts.map((c) => ({
          id: c.id,
          startAt: c.startAt.toISOString(),
          endAt: c.endAt.toISOString(),
          type: c.type,
        })),
      };
    });
  }
}
