import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import {
  DriverLocationForbiddenError,
  DriverProfileNotFoundError,
} from "../../domain/errors/dispatch-errors";

export interface UpdateDriverLocationInput {
  /** Caller must be the owning user; admin path uses a separate use case. */
  driverProfileId: string;
  lat: number;
  lng: number;
}

const validateCoord = (lat: number, lng: number): void => {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`coordinates out of range (lat=${lat.toString()}, lng=${lng.toString()})`);
  }
};

/**
 * Driver app (A4f) calls this on every position update. The use case
 * enforces owner check (auth user must own the driver profile) — admin
 * smoke fixtures use SetOnlineStatus + UpdateLocation directly via a
 * separate admin endpoint that bypasses the owner check.
 */
@Injectable()
export class UpdateDriverLocationUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(
    input: UpdateDriverLocationInput,
    actor: { userId: string; allowAdmin?: boolean },
  ): Promise<void> {
    validateCoord(input.lat, input.lng);
    const now = this.clock.now();

    await this.tx.run(async (tx) => {
      const profile = await this.driverRepo.findActiveById(tx, input.driverProfileId);
      if (!profile) throw new DriverProfileNotFoundError();
      if (!actor.allowAdmin && profile.userId !== actor.userId) {
        throw new DriverLocationForbiddenError();
      }

      const ok = await this.driverRepo.updateLocation(tx, input.driverProfileId, {
        lat: input.lat,
        lng: input.lng,
        updatedAt: now,
      });
      if (!ok) throw new DriverProfileNotFoundError();
    });
  }
}
