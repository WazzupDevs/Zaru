import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

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
  DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT,
  type DriverDispatchCooldownRepositoryPort,
} from "../../application/ports/driver-dispatch-cooldown.repository.port";
import {
  DRIVER_OFFER_REPOSITORY_PORT,
  type DriverOfferRepositoryPort,
} from "../../application/ports/driver-offer.repository.port";
import {
  DRIVER_SEARCH_REPOSITORY_PORT,
  type DriverSearchRepositoryPort,
} from "../../application/ports/driver-search.repository.port";
import { CreateDriverOfferUseCase } from "../../application/use-cases/create-driver-offer.use-case";
import {
  DISPATCH_EVENT_TYPES,
  type DispatchFailedPayload,
  type DispatchFailureReason,
  type DriverOfferExpiredPayload,
} from "../../domain/events/dispatch-events";
import { DispatchPolicyService } from "../../domain/services/dispatch-policy.service";
import { DriverMatcher } from "../../domain/services/driver-matcher.service";

import type { Env } from "../../../../config/env";
import type { BookingEntity } from "../../../booking/domain/booking-types";

const EXPIRY_SWEEP_LIMIT = 50;

/**
 * Sweep loop for the offer-based dispatch flow (A4f-2b-2). Three
 * phases per tick:
 *
 *   A. Auto-expire PENDING offers whose 5-minute window has elapsed.
 *      The Accept and Reject use cases also enforce expiry in-tx for
 *      sync correctness; this sweep is the async safety net for
 *      offers the driver never tapped at all.
 *
 *   B. Dispatch new offers. The findDispatchable query returns
 *      CONFIRMED bookings with no active offer, ordered FIFO, and the
 *      matcher excludes any driver with an active reject cooldown for
 *      this booking. CreateDriverOfferUseCase writes the PENDING row.
 *
 *   C. Cleanup expired cooldown rows. Once expiresAt has passed the
 *      driver is eligible again — the matcher already filters on
 *      `expires_at > now`, but a periodic delete keeps the table from
 *      growing unbounded.
 *
 * Failures are fail-isolated per booking — one exception is logged
 * and the loop keeps going. Counters surface in BullMQ metrics so a
 * sustained zero-success run shows up on the dashboard.
 */
@Injectable()
export class BookingDispatchService {
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;
  private readonly locationFreshnessSeconds: number;

  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(DRIVER_OFFER_REPOSITORY_PORT)
    private readonly offerRepo: DriverOfferRepositoryPort,
    @Inject(DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT)
    private readonly cooldownRepo: DriverDispatchCooldownRepositoryPort,
    @Inject(DRIVER_SEARCH_REPOSITORY_PORT)
    private readonly searchRepo: DriverSearchRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly matcher: DriverMatcher,
    private readonly policyService: DispatchPolicyService,
    private readonly createOfferUseCase: CreateDriverOfferUseCase,
    @InjectPinoLogger(BookingDispatchService.name)
    private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    this.maxAttempts = config.get("DISPATCH_MAX_ATTEMPTS", { infer: true });
    this.cooldownMs = config.get("DISPATCH_RETRY_COOLDOWN_MS", { infer: true });
    this.locationFreshnessSeconds = config.get("DISPATCH_LOCATION_FRESHNESS_SECONDS", {
      infer: true,
    });
  }

  async sweep(): Promise<{
    expired: number;
    attempted: number;
    succeeded: number;
    failed: number;
    cooldownsCleared: number;
  }> {
    const now = this.clock.now();
    const stats = { expired: 0, attempted: 0, succeeded: 0, failed: 0, cooldownsCleared: 0 };

    // Phase A — auto-expire stale PENDING offers.
    stats.expired = await this.autoExpire(now);

    // Phase B — dispatch new offers for CONFIRMED bookings without
    // an active offer.
    const candidates = await this.tx.run((tx) =>
      this.bookingRepo.findDispatchable(tx, {
        maxAttempts: this.maxAttempts,
        cooldownMs: this.cooldownMs,
        now,
        limit: 20,
      }),
    );

    for (const booking of candidates) {
      stats.attempted++;
      try {
        const ok = await this.dispatchOne(booking, now);
        if (ok) stats.succeeded++;
        else stats.failed++;
      } catch (err) {
        stats.failed++;
        this.logger.warn(
          {
            bookingId: booking.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "dispatch attempt failed (continuing batch)",
        );
      }
    }

    // Phase C — purge cooldowns that have aged out.
    stats.cooldownsCleared = await this.tx.run((tx) => this.cooldownRepo.deleteExpired(tx, now));

    if (stats.expired > 0 || stats.attempted > 0 || stats.cooldownsCleared > 0) {
      this.logger.info(stats, "dispatch sweep completed");
    }
    return stats;
  }

  private async autoExpire(now: Date): Promise<number> {
    const expired = await this.tx.run((tx) =>
      this.offerRepo.findExpiredPending(tx, now, EXPIRY_SWEEP_LIMIT),
    );

    let count = 0;
    for (const offer of expired) {
      try {
        await this.tx.run(async (tx) => {
          const transitioned = await this.offerRepo.transitionStatus(tx, {
            offerId: offer.id,
            fromVersion: offer.version,
            toStatus: "EXPIRED",
            fields: { expiredAt: now },
          });
          if (!transitioned) return; // Lost a race with accept/reject — skip.
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
          count++;
        });
      } catch (err) {
        this.logger.warn(
          {
            offerId: offer.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "auto-expire failed for offer (continuing)",
        );
      }
    }
    return count;
  }

  /**
   * Match + offer-create for one booking. Returns true on offer
   * created, false when the matcher returned no candidate (a
   * DispatchFailed event is emitted in that case).
   */
  private async dispatchOne(booking: BookingEntity, now: Date): Promise<boolean> {
    const policy = this.policyService.getPolicy();

    const { activeOffer, excludeDriverIds } = await this.tx.run(async (tx) => {
      const active = await this.offerRepo.findActiveByBookingId(tx, booking.id);
      if (active) return { activeOffer: active, excludeDriverIds: [] as string[] };

      // Exclude every driver who has already been offered this
      // booking (PENDING / EXPIRED / REJECTED / past CANCELLED). The
      // (booking_id, driver_profile_id) unique on driver_offers also
      // backstops this, but pushing the filter into the candidate
      // query keeps the matcher from doing wasted scoring work.
      const priorDriverIds = await this.offerRepo.findPriorDriverIdsForBooking(tx, booking.id);
      return { activeOffer: null, excludeDriverIds: priorDriverIds };
    });

    if (activeOffer) {
      // Already has a live offer (PENDING / ACCEPTED / ON_THE_WAY /
      // ARRIVED / IN_PROGRESS). Worker waits for it to terminate
      // before re-dispatching.
      return false;
    }

    const candidates = await this.tx.run((tx) =>
      this.searchRepo.findCandidates(tx, {
        vehicleTypeId: booking.vehicleTypeId,
        pickupLat: Number(booking.pickupLat.toString()),
        pickupLng: Number(booking.pickupLng.toString()),
        eventStartAt: booking.eventStartAt,
        eventEndAt: booking.eventEndAt,
        maxRadiusKm: policy.maxRadiusKm,
        locationFreshnessSeconds: this.locationFreshnessSeconds,
        ...(excludeDriverIds.length > 0 ? { excludeDriverIds } : {}),
      }),
    );

    const match = this.matcher.pickBestMatch(candidates, policy);
    if (!match) {
      await this.recordDispatchFailure(booking, candidates.length, now);
      return false;
    }

    await this.createOfferUseCase.execute({
      bookingId: booking.id,
      driverProfileId: match.candidate.driverProfileId,
      vehicleId: match.candidate.vehicleId,
      score: match.score,
      distanceKm: match.candidate.distanceKm,
    });
    return true;
  }

  private async recordDispatchFailure(
    booking: BookingEntity,
    candidateCount: number,
    now: Date,
  ): Promise<void> {
    const reason: DispatchFailureReason =
      candidateCount === 0 ? "no_drivers_in_radius" : "no_eligible_drivers";
    const newAttempts = booking.dispatchAttempts + 1;

    await this.tx.run(async (tx) => {
      const ticked = await this.bookingRepo.recordDispatchFailure(tx, {
        id: booking.id,
        fromVersion: booking.version,
        dispatchAttempts: newAttempts,
        lastDispatchAt: now,
        dispatchFailedReason: reason,
      });
      if (!ticked) return;

      const payload: DispatchFailedPayload = {
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
        payload,
      });
    });
  }
}
