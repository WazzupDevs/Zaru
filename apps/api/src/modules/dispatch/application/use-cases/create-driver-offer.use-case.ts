import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { BookingNotFoundError } from "../../../booking/domain/errors/booking-errors";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../../booking/domain/ports/booking.repository.port";
import {
  BookingNotDispatchableError,
  ConcurrentDispatchError,
  DriverHasActiveOfferError,
} from "../../domain/errors/dispatch-errors";
import {
  DISPATCH_EVENT_TYPES,
  type DriverDispatchedPayload,
} from "../../domain/events/dispatch-events";
import {
  DRIVER_OFFER_REPOSITORY_PORT,
  type DriverOfferRepositoryPort,
} from "../ports/driver-offer.repository.port";

import type { DriverOfferEntity } from "../../domain/driver-offer-types";

export interface CreateDriverOfferInput {
  bookingId: string;
  driverProfileId: string;
  vehicleId: string;
  /** Score the matcher assigned (analytics snapshot, not used downstream). */
  score: number;
  /** Driver→pickup distance in km (analytics snapshot). */
  distanceKm: number;
}

const OFFER_TTL_MS = 5 * 60 * 1000;

/**
 * CreateDriverOfferUseCase — the A4f-2b orchestration seam that
 * replaces AssignDriverToBookingUseCase. The matcher (in the worker
 * service) picks a driver-vehicle pair; this use case writes the
 * PENDING offer row, ticks the booking's dispatch counter, and emits
 * the outbox event the driver-facing notification listener consumes.
 *
 * The booking row stays CONFIRMED here. Only AcceptDriverOfferUseCase
 * (A4f-2a) transitions to DRIVER_ASSIGNED — which keeps the customer
 * from seeing "atandı → iptal → atandı" while the offer is still in
 * the 5-minute pending window.
 *
 * Ordering inside the tx:
 *   1. Load booking + state guard (CONFIRMED only)
 *   2. Single-active-offer guard (defensive; matcher already filters
 *      by availability, but a parallel offer-create could still race)
 *   3. Tick dispatchAttempts + lastDispatchAt (worker cooldown anchor)
 *   4. Create PENDING offer with 5-minute expiresAt
 *   5. Outbox dispatch.DriverDispatched (PII-free payload)
 *
 * Payload discipline: ids + score + distance + attempts only. No
 * lat/lng/plate/address ever appears — see A4f-2b-1 flaky test fix
 * for why we assert this with toHaveProperty rather than substring.
 */
@Injectable()
export class CreateDriverOfferUseCase {
  constructor(
    @Inject(DRIVER_OFFER_REPOSITORY_PORT)
    private readonly offerRepo: DriverOfferRepositoryPort,
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(input: CreateDriverOfferInput): Promise<DriverOfferEntity> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + OFFER_TTL_MS);

    return this.tx.run(async (tx) => {
      const booking = await this.bookingRepo.findById(tx, input.bookingId);
      if (!booking) throw new BookingNotFoundError();
      if (booking.status !== "CONFIRMED") {
        throw new BookingNotDispatchableError(booking.status);
      }

      const activeForDriver = await this.offerRepo.findActiveByDriverId(tx, input.driverProfileId);
      if (activeForDriver.length > 0) {
        throw new DriverHasActiveOfferError();
      }

      const newAttempts = booking.dispatchAttempts + 1;
      const ticked = await this.bookingRepo.recordDispatchFailure(tx, {
        id: booking.id,
        fromVersion: booking.version,
        dispatchAttempts: newAttempts,
        lastDispatchAt: now,
        // Not actually a failure — we just reuse the same column-bump
        // path so the cooldown anchor (lastDispatchAt) advances. The
        // dispatchFailedReason explicitly nulls so a previous failure
        // marker (no_drivers_in_radius) doesn't survive a successful
        // offer create.
        dispatchFailedReason: null,
      });
      if (!ticked) throw new ConcurrentDispatchError();

      const offer = await this.offerRepo.create(tx, {
        bookingId: booking.id,
        driverProfileId: input.driverProfileId,
        vehicleId: input.vehicleId,
        expiresAt,
        matchedDistanceKm: input.distanceKm,
        matchedScore: input.score,
      });

      const payload: DriverDispatchedPayload = {
        bookingId: booking.id,
        driverProfileId: input.driverProfileId,
        vehicleId: input.vehicleId,
        distanceKm: input.distanceKm,
        score: input.score,
        attempts: newAttempts,
        dispatchedAt: now.toISOString(),
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: booking.id,
        eventType: DISPATCH_EVENT_TYPES.DRIVER_DISPATCHED,
        payload,
      });

      return offer;
    });
  }
}
