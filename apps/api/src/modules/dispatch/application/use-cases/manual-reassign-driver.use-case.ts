import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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
  VEHICLE_AVAILABILITY_REPOSITORY_PORT,
  type VehicleAvailabilityRepositoryPort,
} from "../../../supply/application/ports/vehicle-availability.repository.port";
import {
  BookingNotDispatchableError,
  ConcurrentDispatchError,
  NoAvailableDriverError,
} from "../../domain/errors/dispatch-errors";
import {
  DISPATCH_EVENT_TYPES,
  type ManualReassignmentPayload,
} from "../../domain/events/dispatch-events";
import { DispatchPolicyService } from "../../domain/services/dispatch-policy.service";
import { DriverMatcher } from "../../domain/services/driver-matcher.service";
import {
  DRIVER_SEARCH_REPOSITORY_PORT,
  type DriverSearchRepositoryPort,
} from "../ports/driver-search.repository.port";

import type { Env } from "../../../../config/env";
import type { BookingEntity } from "../../../booking/domain/booking-types";

export interface ManualReassignDriverInput {
  bookingId: string;
  /** Free-text admin reason — recorded for audit, not in event payload. */
  reason: string;
}

/**
 * Admin override on a DRIVER_ASSIGNED booking. Soft-deletes the previous
 * BOOKED availability, picks a new candidate (excluding the previous
 * driver), and atomically swaps driverId/vehicleId. Status stays
 * DRIVER_ASSIGNED — the state machine table doesn't need a new edge for
 * the reassign flow (see ADR 0019 reassignDriver port doc).
 */
@Injectable()
export class ManualReassignDriverUseCase {
  private readonly locationFreshnessSeconds: number;

  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(DRIVER_SEARCH_REPOSITORY_PORT)
    private readonly searchRepo: DriverSearchRepositoryPort,
    @Inject(VEHICLE_AVAILABILITY_REPOSITORY_PORT)
    private readonly availRepo: VehicleAvailabilityRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly matcher: DriverMatcher,
    private readonly policyService: DispatchPolicyService,
    config: ConfigService<Env, true>,
  ) {
    this.locationFreshnessSeconds = config.get("DISPATCH_LOCATION_FRESHNESS_SECONDS", {
      infer: true,
    });
    void randomUUID; // reserved for future audit-log id generation
  }

  async execute(
    input: ManualReassignDriverInput,
    actor: { userId: string; role: "ADMIN" },
  ): Promise<BookingEntity> {
    if (input.reason.trim() === "") {
      throw new NoAvailableDriverError("no_eligible_drivers");
    }
    const now = this.clock.now();
    const policy = this.policyService.getPolicy();
    void actor.role;

    return this.tx.run(async (tx) => {
      const booking = await this.bookingRepo.findById(tx, input.bookingId);
      if (!booking) throw new BookingNotFoundError();
      if (booking.status !== "DRIVER_ASSIGNED" || !booking.driverId) {
        throw new BookingNotDispatchableError(booking.status);
      }
      const previousDriverId = booking.driverId;

      // Soft-delete the BOOKED availability for the old driver so the
      // candidate query for the new pick doesn't see a conflict.
      const previousBooked = await this.availRepo.findBookedForBooking(tx, booking.id);
      if (previousBooked) {
        await this.availRepo.softDelete(tx, previousBooked.id, now);
      }

      const candidates = await this.searchRepo.findCandidates(tx, {
        vehicleTypeId: booking.vehicleTypeId,
        pickupLat: Number(booking.pickupLat.toString()),
        pickupLng: Number(booking.pickupLng.toString()),
        eventStartAt: booking.eventStartAt,
        eventEndAt: booking.eventEndAt,
        maxRadiusKm: policy.maxRadiusKm,
        locationFreshnessSeconds: this.locationFreshnessSeconds,
        excludeDriverIds: [previousDriverId],
      });

      const match = this.matcher.pickBestMatch(candidates, policy);
      if (!match) {
        throw new NoAvailableDriverError(
          candidates.length === 0 ? "no_drivers_in_radius" : "no_eligible_drivers",
        );
      }

      const updated = await this.bookingRepo.reassignDriver(tx, {
        id: booking.id,
        fromVersion: booking.version,
        driverId: match.candidate.driverProfileId,
        vehicleId: match.candidate.vehicleId,
        assignedAt: now,
        dispatchAttempts: booking.dispatchAttempts + 1,
      });
      if (!updated) throw new ConcurrentDispatchError();

      await this.availRepo.create(tx, {
        vehicleId: match.candidate.vehicleId,
        driverProfileId: match.candidate.driverProfileId,
        startAt: booking.eventStartAt,
        endAt: booking.eventEndAt,
        type: "BOOKED",
        bookingId: booking.id,
        reason: `manual reassign: ${input.reason.trim()}`,
      });

      const payload: ManualReassignmentPayload = {
        bookingId: booking.id,
        previousDriverProfileId: previousDriverId,
        newDriverProfileId: match.candidate.driverProfileId,
        reassignedByUserId: actor.userId,
        reassignedAt: now.toISOString(),
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: booking.id,
        eventType: DISPATCH_EVENT_TYPES.MANUAL_REASSIGNMENT,
        payload,
      });

      return updated;
    });
  }
}
