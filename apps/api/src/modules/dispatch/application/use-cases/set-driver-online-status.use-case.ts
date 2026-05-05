import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import {
  DriverLocationForbiddenError,
  DriverProfileNotFoundError,
} from "../../domain/errors/dispatch-errors";

export interface SetDriverOnlineStatusInput {
  driverProfileId: string;
  isOnline: boolean;
}

@Injectable()
export class SetDriverOnlineStatusUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(
    input: SetDriverOnlineStatusInput,
    actor: { userId: string; allowAdmin?: boolean },
  ): Promise<void> {
    await this.tx.run(async (tx) => {
      const profile = await this.driverRepo.findActiveById(tx, input.driverProfileId);
      if (!profile) throw new DriverProfileNotFoundError();
      if (!actor.allowAdmin && profile.userId !== actor.userId) {
        throw new DriverLocationForbiddenError();
      }
      const ok = await this.driverRepo.setOnline(tx, input.driverProfileId, input.isOnline);
      if (!ok) throw new DriverProfileNotFoundError();
    });
  }
}
