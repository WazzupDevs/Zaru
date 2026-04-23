import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import { InvalidDriverStatusTransitionError } from "../../domain/errors/invalid-driver-status-transition.error";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRecord,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

export interface UpdateDriverProfileInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
}

@Injectable()
export class UpdateDriverProfileUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly repo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(
    input: UpdateDriverProfileInput,
    actor: { userId: string },
  ): Promise<DriverProfileRecord> {
    return this.tx.run(async (tx) => {
      const profile = await this.repo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new DriverProfileNotFoundError();
      // Only DRAFT may be edited by the driver — once submitted the form
      // belongs to the review queue.
      if (profile.status !== "DRAFT") {
        throw new InvalidDriverStatusTransitionError(profile.status, "DRAFT");
      }
      await this.repo.updateBasics(tx, profile.id, input);
      const updated = await this.repo.findActiveById(tx, profile.id);
      if (!updated) throw new DriverProfileNotFoundError();
      return updated;
    });
  }
}
