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
} from "../../domain/errors/dispatch-errors";
import {
  DISPATCH_EVENT_TYPES,
  type DispatchFailedPayload,
  type DispatchFailureReason,
  type DriverDispatchedPayload,
} from "../../domain/events/dispatch-events";
import { DispatchPolicyService } from "../../domain/services/dispatch-policy.service";
import { DriverMatcher } from "../../domain/services/driver-matcher.service";
import {
  DRIVER_SEARCH_REPOSITORY_PORT,
  type DriverSearchRepositoryPort,
} from "../ports/driver-search.repository.port";

import type { Env } from "../../../../config/env";

export interface AssignDriverToBookingInput {
  bookingId: string;
  /** Drivers to skip (used by ManualReassign to exclude the previous driver). */
  excludeDriverIds?: string[];
}

export interface AssignDriverToBookingResult {
  success: boolean;
  driverProfileId?: string;
  reason?: DispatchFailureReason;
}

/**
 * AssignDriverToBooking — atomic CONFIRMED → DRIVER_ASSIGNED with the
 * matched driver. Called by:
 *   - BookingDispatchWorker on CONFIRMED bookings
 *   - ManualReassignDriver after unblocking the previous availability
 *
 * Order of operations inside the tx:
 *   1. Load booking + status guard (CONFIRMED only)
 *   2. PostGIS candidate query (filters for radius, online, vehicle, conflicts)
 *   3. DriverMatcher scoring (deterministic pick)
 *   4. Atomic assignDriver (optimistic lock via version + status='CONFIRMED')
 *   5. Create BOOKED VehicleAvailability so the next worker tick won't
 *      offer the same driver to a parallel booking
 *   6. Outbox event (PII-free payload)
 *
 * If matcher returns null we record a failure (counter++ + reason +
 * lastDispatchAt) and emit dispatch.DispatchFailed; status stays CONFIRMED
 * so the worker will pick it up again after cooldown.
 */
@Injectable()
export class AssignDriverToBookingUseCase {
  private readonly maxAttempts: number;
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
    this.maxAttempts = config.get("DISPATCH_MAX_ATTEMPTS", { infer: true });
    this.locationFreshnessSeconds = config.get("DISPATCH_LOCATION_FRESHNESS_SECONDS", {
      infer: true,
    });
  }

  async execute(input: AssignDriverToBookingInput): Promise<AssignDriverToBookingResult> {
    const now = this.clock.now();
    const policy = this.policyService.getPolicy();

    return this.tx.run(async (tx) => {
      const booking = await this.bookingRepo.findById(tx, input.bookingId);
      if (!booking) throw new BookingNotFoundError();
      if (booking.status !== "CONFIRMED") {
        throw new BookingNotDispatchableError(booking.status);
      }

      const candidates = await this.searchRepo.findCandidates(tx, {
        vehicleTypeId: booking.vehicleTypeId,
        pickupLat: Number(booking.pickupLat.toString()),
        pickupLng: Number(booking.pickupLng.toString()),
        eventStartAt: booking.eventStartAt,
        eventEndAt: booking.eventEndAt,
        maxRadiusKm: policy.maxRadiusKm,
        locationFreshnessSeconds: this.locationFreshnessSeconds,
        ...(input.excludeDriverIds ? { excludeDriverIds: input.excludeDriverIds } : {}),
      });

      const match = this.matcher.pickBestMatch(candidates, policy);
      const newAttempts = booking.dispatchAttempts + 1;

      if (!match) {
        const reason: DispatchFailureReason =
          candidates.length === 0 ? "no_drivers_in_radius" : "no_eligible_drivers";
        await this.bookingRepo.recordDispatchFailure(tx, {
          id: booking.id,
          fromVersion: booking.version,
          dispatchAttempts: newAttempts,
          lastDispatchAt: now,
          dispatchFailedReason: reason,
        });
        const failedPayload: DispatchFailedPayload = {
          bookingId: booking.id,
          attempts: newAttempts,
          reason,
          requiresManualReview: newAttempts >= this.maxAttempts,
          failedAt: now.toISOString(),
        };
        await this.outbox.write(tx, {
          aggregateType: "Booking",
          aggregateId: booking.id,
          eventType: DISPATCH_EVENT_TYPES.DISPATCH_FAILED,
          payload: failedPayload,
        });
        return { success: false, reason };
      }

      const updated = await this.bookingRepo.assignDriver(tx, {
        id: booking.id,
        fromVersion: booking.version,
        driverId: match.candidate.driverProfileId,
        vehicleId: match.candidate.vehicleId,
        assignedAt: now,
        dispatchAttempts: newAttempts,
      });
      if (!updated) throw new ConcurrentDispatchError();

      // Block the vehicle for the event window so a parallel dispatch
      // tick cannot offer the same driver to another booking. The
      // search query checks vehicle_availabilities; this row is the
      // sentinel.
      await this.availRepo.create(tx, {
        vehicleId: match.candidate.vehicleId,
        driverProfileId: match.candidate.driverProfileId,
        startAt: booking.eventStartAt,
        endAt: booking.eventEndAt,
        type: "BOOKED",
        bookingId: booking.id,
      });

      const dispatchedPayload: DriverDispatchedPayload = {
        bookingId: booking.id,
        driverProfileId: match.candidate.driverProfileId,
        vehicleId: match.candidate.vehicleId,
        distanceKm: match.candidate.distanceKm,
        score: match.score,
        attempts: newAttempts,
        dispatchedAt: now.toISOString(),
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: booking.id,
        eventType: DISPATCH_EVENT_TYPES.DRIVER_DISPATCHED,
        payload: dispatchedPayload,
      });

      return { success: true, driverProfileId: match.candidate.driverProfileId };
    });
  }
}
