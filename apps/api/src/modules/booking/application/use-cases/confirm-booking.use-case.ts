import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  PRICE_QUOTE_REPOSITORY_PORT,
  type PriceQuoteRepositoryPort,
} from "../../../pricing/application/ports/price-quote.repository.port";
import { QuoteNotFoundError } from "../../../pricing/domain/errors/pricing-errors";
import { BookingAccessDeniedError } from "../../domain/errors/booking-errors";
import {
  BOOKING_EVENT_TYPES,
  type BookingConfirmedPayload,
  type BookingCreatedPayload,
} from "../../domain/events/booking-events";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../domain/ports/booking.repository.port";

import type { BookingEntity } from "../../domain/booking-types";

export interface ConfirmBookingInput {
  quoteId: string;
}

/**
 * ConfirmBooking — quote → booking handoff.
 *
 * In A4b we go straight DRAFT-bypass: the booking is created in CONFIRMED
 * status. A4c (payment) re-introduces the DRAFT step (Confirm creates
 * DRAFT, payment-authorized event lifts to CONFIRMED) but the worker
 * for DRAFT TTL cleanup already exists so the contract is intact.
 *
 * Atomic guarantees:
 *  - Quote consumeQuote (ACTIVE → CONSUMED) and booking insert run in
 *    the SAME tx. If the booking insert fails the quote stays ACTIVE.
 *  - consumeQuote is itself an updateMany WHERE status='ACTIVE' so two
 *    parallel confirms on the same quote produce one success + one
 *    QuoteAlreadyConsumedError (race-safe).
 *  - Outbox events join the same tx (transactional outbox).
 */
@Injectable()
export class ConfirmBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(PRICE_QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: PriceQuoteRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(input: ConfirmBookingInput, actor: { userId: string }): Promise<BookingEntity> {
    const now = this.clock.now();
    const bookingId = randomUUID();

    return this.tx.run(async (tx) => {
      // Owner check first — fail fast before consuming the quote.
      const quote = await this.quoteRepo.findById(tx, input.quoteId);
      if (!quote) throw new QuoteNotFoundError();
      if (quote.requestedByUserId !== actor.userId) {
        throw new BookingAccessDeniedError();
      }

      // Atomic ACTIVE → CONSUMED. Throws Quote{Expired,AlreadyConsumed,NotFound}Error.
      const consumed = await this.quoteRepo.consumeQuote(tx, input.quoteId, bookingId, now);

      const booking = await this.bookingRepo.create(tx, {
        id: bookingId,
        customerId: actor.userId,
        priceQuoteId: consumed.id,
        status: "CONFIRMED",
        vehicleTypeId: consumed.vehicleTypeId,
        categoryId: consumed.categoryId,
        pickupLat: consumed.pickupLat,
        pickupLng: consumed.pickupLng,
        pickupAddress: consumed.pickupAddress,
        dropoffLat: consumed.dropoffLat,
        dropoffLng: consumed.dropoffLng,
        dropoffAddress: consumed.dropoffAddress,
        eventStartAt: consumed.eventStartAt,
        eventEndAt: consumed.eventEndAt,
        totalAmount: consumed.totalAmount,
        currency: consumed.currency,
        confirmedAt: now,
      });

      const createdPayload: BookingCreatedPayload = {
        bookingId: booking.id,
        customerId: booking.customerId,
        vehicleTypeId: booking.vehicleTypeId,
        categoryId: booking.categoryId,
        // Always-2-decimal-place serialization. Decimal.toString() drops
        // trailing zeros, so route through Number → toFixed(2) so the
        // event payload feeds notification templates with a stable
        // "6877.00" shape regardless of what the DB returned.
        totalAmount: Number(booking.totalAmount.toString()).toFixed(2),
        currency: booking.currency,
        eventStartAt: booking.eventStartAt.toISOString(),
        eventEndAt: booking.eventEndAt.toISOString(),
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: booking.id,
        eventType: BOOKING_EVENT_TYPES.CREATED,
        payload: createdPayload,
      });

      const confirmedPayload: BookingConfirmedPayload = {
        bookingId: booking.id,
        customerId: booking.customerId,
        confirmedAt: now.toISOString(),
      };
      await this.outbox.write(tx, {
        aggregateType: "Booking",
        aggregateId: booking.id,
        eventType: BOOKING_EVENT_TYPES.CONFIRMED,
        payload: confirmedPayload,
      });

      return booking;
    });
  }
}
