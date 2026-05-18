import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { ValidationError } from "../../../../common/errors/domain-error";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import { DriverOfferStateMachine } from "../../domain/driver-offer-state-machine";
import {
  ConcurrentOfferModificationError,
  OfferExpiredError,
  OfferForbiddenError,
  OfferNotFoundError,
} from "../../domain/errors/dispatch-errors";
import {
  DISPATCH_EVENT_TYPES,
  type DriverOfferExpiredPayload,
  type DriverOfferRejectedPayload,
} from "../../domain/events/dispatch-events";
import {
  DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT,
  type DriverDispatchCooldownRepositoryPort,
} from "../ports/driver-dispatch-cooldown.repository.port";
import {
  DRIVER_OFFER_REPOSITORY_PORT,
  type DriverOfferRepositoryPort,
} from "../ports/driver-offer.repository.port";

import type { DriverOfferEntity, DriverRejectReason } from "../../domain/driver-offer-types";

export interface RejectDriverOfferInput {
  offerId: string;
  /** Auth user.id — used to look up DriverProfile + authorise the offer. */
  driverUserId: string;
  reason: DriverRejectReason;
  /** Optional free-form note; capped at 500 chars (analytics ergonomics). */
  note?: string;
}

const REJECT_NOTE_MAX_LEN = 500;
const REJECT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Driver rejects an offer. Companion to AcceptDriverOfferUseCase —
 * same guard pattern (PENDING + expiry + ownership) but the side
 * effects are different: the booking row is untouched (it stays
 * CONFIRMED for the worker to re-dispatch), a cooldown row is upserted
 * so the worker excludes this driver on the next attempt, and the
 * outbox event fires so re-dispatch can pick up the booking.
 *
 * Cooldown is a SLIDING 5-minute window — re-reject of the same offer
 * (idempotent path) won't fire, but if for any reason the row needs
 * extension the upsert pushes expiresAt forward without duplicating.
 *
 * The 500-char note cap is enforced here rather than in a controller
 * Zod schema so the smoke / integration paths that bypass the HTTP
 * layer also see the rule.
 */
@Injectable()
export class RejectDriverOfferUseCase {
  constructor(
    @Inject(DRIVER_OFFER_REPOSITORY_PORT)
    private readonly offerRepo: DriverOfferRepositoryPort,
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly driverRepo: DriverProfileRepositoryPort,
    @Inject(DRIVER_DISPATCH_COOLDOWN_REPOSITORY_PORT)
    private readonly cooldownRepo: DriverDispatchCooldownRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(input: RejectDriverOfferInput): Promise<DriverOfferEntity> {
    if (input.note !== undefined && input.note.length > REJECT_NOTE_MAX_LEN) {
      throw new ValidationError(`reject note exceeds ${String(REJECT_NOTE_MAX_LEN)} characters`, {
        length: input.note.length,
        max: REJECT_NOTE_MAX_LEN,
      });
    }

    const now = this.clock.now();

    return this.tx.run(async (tx) => {
      const offer = await this.offerRepo.findById(tx, input.offerId);
      if (!offer) throw new OfferNotFoundError();

      const driver = await this.driverRepo.findActiveByUserId(tx, input.driverUserId);
      if (offer.driverProfileId !== driver?.id) {
        throw new OfferForbiddenError();
      }

      // Idempotent re-reject — driver double-taps Reddet, the second
      // call short-circuits. Cooldown was already written by the
      // first call so the worker remains correct.
      if (offer.status === "REJECTED") return offer;

      // Expiry guard inside the tx (same defense-in-depth as accept).
      // A pending offer past expiresAt becomes EXPIRED + emits the
      // expiry event; the worker re-dispatches as normal. We do this
      // before assertTransition so the driver sees "süre doldu" rather
      // than a generic invalid-transition message.
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

      DriverOfferStateMachine.assertTransition(offer.status, "REJECTED");

      const rejected = await this.offerRepo.transitionStatus(tx, {
        offerId: offer.id,
        fromVersion: offer.version,
        toStatus: "REJECTED",
        fields: {
          rejectedAt: now,
          rejectReason: input.reason,
          rejectNote: input.note ?? null,
        },
      });
      if (!rejected) throw new ConcurrentOfferModificationError();

      await this.cooldownRepo.upsert(tx, {
        driverProfileId: driver.id,
        bookingId: offer.bookingId,
        expiresAt: new Date(now.getTime() + REJECT_COOLDOWN_MS),
      });

      const payload: DriverOfferRejectedPayload = {
        offerId: offer.id,
        bookingId: offer.bookingId,
        driverProfileId: driver.id,
        reason: input.reason,
        rejectedAt: now.toISOString(),
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: offer.bookingId,
        eventType: DISPATCH_EVENT_TYPES.DRIVER_OFFER_REJECTED,
        payload,
      });

      return rejected;
    });
  }
}
