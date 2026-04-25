import { Inject, Injectable } from "@nestjs/common";

import { ForbiddenError } from "../../../../common/errors/domain-error";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import {
  VEHICLE_AVAILABILITY_REPOSITORY_PORT,
  type AvailabilityRecord,
  type VehicleAvailabilityRepositoryPort,
} from "../ports/vehicle-availability.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRepositoryPort,
} from "../ports/vehicle.repository.port";

export interface ListAvailabilityInput {
  vehicleId: string;
  from?: Date | undefined;
  to?: Date | undefined;
}

@Injectable()
export class ListAvailabilityUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(VEHICLE_AVAILABILITY_REPOSITORY_PORT)
    private readonly availRepo: VehicleAvailabilityRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(
    input: ListAvailabilityInput,
    actor: { userId: string },
  ): Promise<AvailabilityRecord[]> {
    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new ForbiddenError("Driver profile required.");
      const vehicle = await this.vehicleRepo.findActiveById(tx, input.vehicleId);
      if (vehicle?.driverProfileId !== profile.id) throw new VehicleNotFoundError();

      return this.availRepo.listForVehicle(tx, input.vehicleId, {
        from: input.from,
        to: input.to,
      });
    });
  }
}
