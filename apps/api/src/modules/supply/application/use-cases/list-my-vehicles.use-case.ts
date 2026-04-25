import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRecord,
  type VehicleRepositoryPort,
} from "../ports/vehicle.repository.port";

@Injectable()
export class ListMyVehiclesUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(actor: { userId: string }): Promise<VehicleRecord[]> {
    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new DriverProfileNotFoundError();
      return this.vehicleRepo.listByDriver(tx, profile.id);
    });
  }
}
