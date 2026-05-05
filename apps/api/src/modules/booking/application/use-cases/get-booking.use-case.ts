import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { BookingAccessDeniedError, BookingNotFoundError } from "../../domain/errors/booking-errors";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../domain/ports/booking.repository.port";

import type { BookingEntity } from "../../domain/booking-types";

export interface GetBookingActor {
  userId: string;
  role: "CUSTOMER" | "ADMIN" | "DRIVER" | "SUPPORT";
}

@Injectable()
export class GetBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly repo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
  ) {}

  async execute(bookingId: string, actor: GetBookingActor): Promise<BookingEntity> {
    return this.tx.run(async (tx) => {
      const booking = await this.repo.findById(tx, bookingId);
      if (!booking) throw new BookingNotFoundError();
      if (
        actor.role !== "ADMIN" &&
        actor.role !== "SUPPORT" &&
        booking.customerId !== actor.userId
      ) {
        throw new BookingAccessDeniedError();
      }
      return booking;
    });
  }
}
