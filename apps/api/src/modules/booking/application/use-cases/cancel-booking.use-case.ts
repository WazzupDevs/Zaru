import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { BookingStateMachine } from "../../domain/booking-state-machine";
import {
  BookingAccessDeniedError,
  BookingNotCancellableError,
  BookingNotFoundError,
  CancellationReasonRequiredError,
  ConcurrentBookingModificationError,
  InvalidBookingTransitionError,
} from "../../domain/errors/booking-errors";
import {
  BOOKING_EVENT_TYPES,
  type BookingCancelledPayload,
} from "../../domain/events/booking-events";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../domain/ports/booking.repository.port";

import type { BookingEntity } from "../../domain/booking-types";

export interface CancelBookingInput {
  bookingId: string;
  reason: string;
}

export type CancellingActor =
  | { userId: string; role: "CUSTOMER" }
  | { userId: string; role: "ADMIN" };

/**
 * CancelBooking — customer or admin path. Both go to CANCELLED_BY_CUSTOMER
 * (cancelledByUserId stores the actual actor; the role label distinguishes
 * which surface initiated the cancel). CANCELLED_BY_DRIVER is reserved for
 * driver-initiated cancellations (A4d).
 *
 * State machine guards: terminal states throw BookingNotCancellableError;
 * IN_PROGRESS also throws (event already started — must escalate via
 * dispute, not silent cancel).
 *
 * Optimistic lock via version (ConcurrentBookingModificationError on miss).
 */
@Injectable()
export class CancelBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(input: CancelBookingInput, actor: CancellingActor): Promise<BookingEntity> {
    const trimmedReason = input.reason.trim();
    if (trimmedReason === "") throw new CancellationReasonRequiredError();
    const now = this.clock.now();

    return this.tx.run(async (tx) => {
      const booking = await this.bookingRepo.findById(tx, input.bookingId);
      if (!booking) throw new BookingNotFoundError();

      if (actor.role !== "ADMIN" && booking.customerId !== actor.userId) {
        throw new BookingAccessDeniedError();
      }

      if (!BookingStateMachine.isCancellable(booking.status)) {
        throw new BookingNotCancellableError(booking.status);
      }

      const target = "CANCELLED_BY_CUSTOMER" as const;
      // Re-asserts via the same state machine — defense in depth.
      if (!BookingStateMachine.canTransition(booking.status, target)) {
        throw new InvalidBookingTransitionError(booking.status, target);
      }

      const updated = await this.bookingRepo.transitionStatus(tx, {
        id: booking.id,
        fromVersion: booking.version,
        toStatus: target,
        fields: {
          cancelledAt: now,
          cancelledByUserId: actor.userId,
          cancellationReason: trimmedReason,
        },
      });
      if (!updated) throw new ConcurrentBookingModificationError();

      const payload: BookingCancelledPayload = {
        bookingId: updated.id,
        cancelledByUserId: actor.userId,
        cancelledByRole: actor.role,
        previousStatus: booking.status,
        cancelledAt: now.toISOString(),
        // reason is NOT in payload — free-text customer input, treated as PII-ish.
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: updated.id,
        eventType: BOOKING_EVENT_TYPES.CANCELLED,
        payload,
      });

      return updated;
    });
  }
}
