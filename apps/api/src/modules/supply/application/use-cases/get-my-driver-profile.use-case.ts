import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRecord,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

@Injectable()
export class GetMyDriverProfileUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly repo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(actor: { userId: string }): Promise<DriverProfileRecord> {
    const profile = await this.tx.run((tx) => this.repo.findActiveByUserId(tx, actor.userId));
    if (!profile) throw new DriverProfileNotFoundError();
    return profile;
  }
}
