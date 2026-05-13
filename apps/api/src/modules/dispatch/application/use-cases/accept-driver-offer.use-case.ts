import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../../booking/domain/ports/booking.repository.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import {
  VEHICLE_AVAILABILITY_REPOSITORY_PORT,
  type VehicleAvailabilityRepositoryPort,
} from "../../../supply/application/ports/vehicle-availability.repository.port";
import { DriverOfferStateMachine } from "../../domain/driver-offer-state-machine";
import {
  ConcurrentDispatchError,
  ConcurrentOfferModificationError,
  DriverHasActiveOfferError,
  OfferExpiredError,
  OfferForbiddenError,
  OfferNotFoundError,
} from "../../domain/errors/dispatch-errors";
import {
  DISPATCH_EVENT_TYPES,
  type DriverOfferAcceptedPayload,
  type DriverOfferExpiredPayload,
} from "../../domain/events/dispatch-events";
import {
  DRIVER_OFFER_REPOSITORY_PORT,
  type DriverOfferRepositoryPort,
} from "../ports/driver-offer.repository.port";

import type { DriverOfferEntity } from "../../domain/driver-offer-types";

export interface AcceptDriverOfferInput {
  offerId: string;
  /** Auth user.id — used to look up DriverProfile + authorise the offer. */
  driverUserId: string;
}

/**
 * AcceptDriverOfferUseCase — the seam where A4f-2 attaches to the
 * pre-existing dispatch machinery. The matcher used to immediately
 * write CONFIRMED → DRIVER_ASSIGNED + BOOKED availability (ADR 0020
 * pattern); now it just creates a PENDING offer, and THIS use case
 * does the assignment + availability sentinel that AssignDriver used
 * to do.
 *
 * Order inside the tx — mirrors the AssignDriverToBooking ordering so
 * the dispatcher's freshness/conflict invariants hold:
 *   1. Load offer + auth (offer belongs to the requesting driver)
 *   2. State guards (PENDING + not expired + driver has no other active offer)
 *   3. Transition offer PENDING → ACCEPTED (optimistic lock)
 *   4. Transition booking CONFIRMED → DRIVER_ASSIGNED (atomic on
 *      status='CONFIRMED' AND version=…). The booking row still
 *      gates concurrency — two parallel accepts on the same booking
 *      cannot both win.
 *   5. Create BOOKED VehicleAvailability so a parallel worker tick
 *      doesn't offer the same driver/vehicle slot.
 *   6. Outbox booking.DriverAccepted (notification listener will fan
 *      out a customer push/SMS via the A4f-1b pickChannel routing).
 *
 * The 5-minute expiry is enforced in-line: if now > expiresAt, we
 * transition the offer to EXPIRED inside the same tx + emit
 * DriverOfferExpired so the worker re-dispatches. The HTTP layer
 * surfaces OfferExpiredError → 410, which the driver mobile maps to
 * "Süre Doldu — bu iş başkasına gitti".
 */
@Injectable()
export class AcceptDriverOfferUseCase {
  constructor(
    @Inject(DRIVER_OFFER_REPOSITORY_PORT)
    private readonly offerRepo: DriverOfferRepositoryPort,
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(VEHICLE_AVAILABILITY_REPOSITORY_PORT)
    private readonly availRepo: VehicleAvailabilityRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(input: AcceptDriverOfferInput): Promise<DriverOfferEntity> {
    const now = this.clock.now();

    return this.tx.run(async (tx) => {
      const offer = await this.offerRepo.findById(tx, input.offerId);
      if (!offer) throw new OfferNotFoundError();

      const driver = await this.driverRepo.findActiveByUserId(tx, input.driverUserId);
      if (offer.driverProfileId !== driver?.id) {
        throw new OfferForbiddenError();
      }

      // Idempotent re-accept — driver double-taps, second request short-
      // circuits. The booking transition already happened on the first.
      if (offer.status === "ACCEPTED") return offer;

      DriverOfferStateMachine.assertTransition(offer.status, "ACCEPTED");

      // Expiry check inside the tx — if the 5-minute window passed
      // while the request was in flight, mark EXPIRED and surface
      // OfferExpiredError. The worker will pick the booking up on the
      // next tick and offer it to the next candidate.
      if (now > offer.expiresAt) {
        const expired = await this.offerRepo.transitionStatus(tx, {
          offerId: offer.id,
          fromVersion: offer.version,
          toStatus: "EXPIRED",
          fields: { expiredAt: now },
        });
        if (expired) {
          const payload: DriverOfferExpiredPayload = {
            offerId: offer.id,
            bookingId: offer.bookingId,
            driverProfileId: offer.driverProfileId,
            expiredAt: now.toISOString(),
          };
          await this.outbox.write(tx, {
            aggregateType: "Booking",
            aggregateId: offer.bookingId,
            eventType: DISPATCH_EVENT_TYPES.DRIVER_OFFER_EXPIRED,
            payload,
          });
        }
        throw new OfferExpiredError();
      }

      // Single-active-offer guard. The driver mobile UI already shows
      // an "Aktif İşine Git" banner when a post-accept offer exists,
      // so reaching this branch implies a tampered request or a race.
      const otherActive = (await this.offerRepo.findActiveByDriverId(tx, driver.id)).filter(
        (o) => o.id !== offer.id,
      );
      if (otherActive.length > 0) throw new DriverHasActiveOfferError();

      const acceptedOffer = await this.offerRepo.transitionStatus(tx, {
        offerId: offer.id,
        fromVersion: offer.version,
        toStatus: "ACCEPTED",
        fields: { acceptedAt: now },
      });
      if (!acceptedOffer) throw new ConcurrentOfferModificationError();

      const booking = await this.bookingRepo.findById(tx, offer.bookingId);
      if (!booking) throw new ConcurrentDispatchError();

      // The matcher's vehicle pick is frozen on the offer row — accept
      // uses it directly without re-resolving. If the vehicle was
      // deactivated between offer and accept, the FK still holds (the
      // row exists; we just won't pick it next time), and a downstream
      // status update / dispatch concern surfaces through the worker.
      const assigned = await this.bookingRepo.assignDriver(tx, {
        id: booking.id,
        fromVersion: booking.version,
        driverId: driver.id,
        vehicleId: offer.vehicleId,
        assignedAt: now,
        dispatchAttempts: booking.dispatchAttempts,
      });
      if (!assigned) throw new ConcurrentDispatchError();

      await this.availRepo.create(tx, {
        vehicleId: offer.vehicleId,
        driverProfileId: driver.id,
        startAt: booking.eventStartAt,
        endAt: booking.eventEndAt,
        type: "BOOKED",
        bookingId: booking.id,
      });

      const payload: DriverOfferAcceptedPayload = {
        offerId: offer.id,
        bookingId: booking.id,
        driverProfileId: driver.id,
        vehicleId: offer.vehicleId,
        acceptedAt: now.toISOString(),
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: booking.id,
        eventType: DISPATCH_EVENT_TYPES.DRIVER_OFFER_ACCEPTED,
        payload,
      });

      return acceptedOffer;
    });
  }
}
