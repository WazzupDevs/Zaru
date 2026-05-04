import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../domain/ports/booking.repository.port";

import type { BookingEntity, BookingStatus } from "../../domain/booking-types";

export interface ListMyBookingsInput {
  status?: BookingStatus;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class ListMyBookingsUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly repo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(input: ListMyBookingsInput, actor: { userId: string }): Promise<BookingEntity[]> {
    return this.tx.run(async (tx) =>
      this.repo.listForCustomer(tx, {
        customerId: actor.userId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      }),
    );
  }
}
