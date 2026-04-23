import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRecord,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListPendingDriversInput {
  limit?: number;
  cursor?: string;
}

@Injectable()
export class ListPendingDriversUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly repo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(
    input: ListPendingDriversInput,
  ): Promise<{ items: DriverProfileRecord[]; nextCursor: string | null }> {
    const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
    return this.tx.run((tx) => this.repo.listPending(tx, { limit, cursor: input.cursor }));
  }
}
