import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { BookingStateMachine } from "../../../booking/domain/booking-state-machine";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../../booking/domain/ports/booking.repository.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import { DriverOfferStateMachine } from "../../domain/driver-offer-state-machine";
import {
  ConcurrentDispatchError,
  ConcurrentOfferModificationError,
  OfferForbiddenError,
  OfferNotFoundError,
} from "../../domain/errors/dispatch-errors";
import {
  DISPATCH_EVENT_TYPES,
  type BookingCompletedPayload,
  type BookingInProgressPayload,
  type DispatchEventType,
  type DriverArrivedPayload,
  type DriverOnTheWayPayload,
} from "../../domain/events/dispatch-events";
import {
  DRIVER_OFFER_REPOSITORY_PORT,
  type DriverOfferRepositoryPort,
  TransitionOfferStatusInput,
} from "../ports/driver-offer.repository.port";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { BookingStatus } from "../../../booking/domain/booking-types";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";

/** Statuses the driver app can drive via PATCH /status (post-accept). */
export type DriverDrivenTargetStatus = "ON_THE_WAY" | "ARRIVED" | "IN_PROGRESS" | "COMPLETED";

export interface UpdateDriverOfferStatusInput {
  offerId: string;
  driverUserId: string;
  targetStatus: DriverDrivenTargetStatus;
}

/**
 * Drives the post-accept driver lifecycle: ACCEPTED → ON_THE_WAY →
 * ARRIVED → IN_PROGRESS → COMPLETED. Reject and accept have their own
 * use cases; this one is only for the four "driver-driven" transitions
 * the mobile app issues from the active job screen.
 *
 * Two of the four transitions cascade onto the booking row:
 *
 *   - IN_PROGRESS → booking DRIVER_ASSIGNED → IN_PROGRESS (startedAt)
 *   - COMPLETED   → booking IN_PROGRESS     → COMPLETED  (completedAt)
 *
 * The state-machine guard on both sides means we don't need to special-
 * case "what if the booking was cancelled while the driver was driving"
 * — the booking transitionStatus where-clause already filters on
 * status, so a cancelled booking surfaces ConcurrentDispatchError and
 * the driver sees the cancel via push (A4f-2b-2 notification chain).
 *
 * One outbox event per transition; the notification listener (A4f-2b-2)
 * fans these out to customer push/SMS.
 */
@Injectable()
export class UpdateDriverOfferStatusUseCase {
  constructor(
    @Inject(DRIVER_OFFER_REPOSITORY_PORT)
    private readonly offerRepo: DriverOfferRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(input: UpdateDriverOfferStatusInput): Promise<DriverOfferEntity> {
    const now = this.clock.now();

    return this.tx.run(async (tx) => {
      const offer = await this.offerRepo.findById(tx, input.offerId);
      if (!offer) throw new OfferNotFoundError();

      const driver = await this.driverRepo.findActiveByUserId(tx, input.driverUserId);
      if (offer.driverProfileId !== driver?.id) {
        throw new OfferForbiddenError();
      }

      // Idempotent same-state target — driver double-taps the same
      // button (or push fires twice). Short-circuit without writes.
      if (offer.status === input.targetStatus) return offer;

      DriverOfferStateMachine.assertTransition(offer.status, input.targetStatus);

      const transitionInput: TransitionOfferStatusInput = {
        offerId: offer.id,
        fromVersion: offer.version,
        toStatus: input.targetStatus,
        fields: { [timestampField(input.targetStatus)]: now },
      };
      const updated = await this.offerRepo.transitionStatus(tx, transitionInput);
      if (!updated) throw new ConcurrentOfferModificationError();

      // Cascade onto the booking when crossing into IN_PROGRESS or
      // COMPLETED. Other transitions (ON_THE_WAY, ARRIVED) are
      // offer-only and don't touch the booking aggregate.
      if (input.targetStatus === "IN_PROGRESS" || input.targetStatus === "COMPLETED") {
        await this.cascadeBookingTransition(tx, offer.bookingId, input.targetStatus, now);
      }

      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: offer.bookingId,
        eventType: eventTypeFor(input.targetStatus),
        payload: buildEventPayload(input.targetStatus, {
          offerId: offer.id,
          bookingId: offer.bookingId,
          driverProfileId: driver.id,
          timestamp: now.toISOString(),
        }),
      });

      return updated;
    });
  }

  private async cascadeBookingTransition(
    tx: TxClient,
    bookingId: string,
    offerTarget: "IN_PROGRESS" | "COMPLETED",
    now: Date,
  ): Promise<void> {
    const booking = await this.bookingRepo.findById(tx, bookingId);
    if (!booking) throw new ConcurrentDispatchError();

    const bookingTarget: BookingStatus = offerTarget; // same-name mapping
    if (!BookingStateMachine.canTransition(booking.status, bookingTarget)) {
      // Booking moved out from under us (cancel, dispute, etc.). The
      // offer row is already updated, but the booking-cascade lost —
      // surface the conflict so the driver app can re-read.
      throw new ConcurrentDispatchError();
    }

    const bookingTimestamp = offerTarget === "IN_PROGRESS" ? "startedAt" : "completedAt";
    const updated = await this.bookingRepo.transitionStatus(tx, {
      id: booking.id,
      fromVersion: booking.version,
      toStatus: bookingTarget,
      fields: { [bookingTimestamp]: now },
    });
    if (!updated) throw new ConcurrentDispatchError();
  }
}

function timestampField(
  status: DriverDrivenTargetStatus,
): keyof NonNullable<TransitionOfferStatusInput["fields"]> {
  switch (status) {
    case "ON_THE_WAY":
      return "onTheWayAt";
    case "ARRIVED":
      return "arrivedAt";
    case "IN_PROGRESS":
      return "inProgressAt";
    case "COMPLETED":
      return "completedAt";
  }
}

function eventTypeFor(status: DriverDrivenTargetStatus): DispatchEventType {
  switch (status) {
    case "ON_THE_WAY":
      return DISPATCH_EVENT_TYPES.DRIVER_ON_THE_WAY;
    case "ARRIVED":
      return DISPATCH_EVENT_TYPES.DRIVER_ARRIVED;
    case "IN_PROGRESS":
      return DISPATCH_EVENT_TYPES.BOOKING_IN_PROGRESS;
    case "COMPLETED":
      return DISPATCH_EVENT_TYPES.BOOKING_COMPLETED;
  }
}

interface EventBase {
  offerId: string;
  bookingId: string;
  driverProfileId: string;
  timestamp: string;
}

function buildEventPayload(
  status: DriverDrivenTargetStatus,
  base: EventBase,
):
  | DriverOnTheWayPayload
  | DriverArrivedPayload
  | BookingInProgressPayload
  | BookingCompletedPayload {
  const { offerId, bookingId, driverProfileId, timestamp } = base;
  switch (status) {
    case "ON_THE_WAY":
      return { offerId, bookingId, driverProfileId, onTheWayAt: timestamp };
    case "ARRIVED":
      return { offerId, bookingId, driverProfileId, arrivedAt: timestamp };
    case "IN_PROGRESS":
      return { offerId, bookingId, driverProfileId, inProgressAt: timestamp };
    case "COMPLETED":
      return { offerId, bookingId, driverProfileId, completedAt: timestamp };
  }
}
