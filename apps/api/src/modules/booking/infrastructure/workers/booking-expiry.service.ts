import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { BOOKING_DRAFT_TTL_MS } from "./booking-expiry.constants";
import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  BOOKING_EVENT_TYPES,
  type BookingExpiredPayload,
} from "../../domain/events/booking-events";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../domain/ports/booking.repository.port";

/**
 * Sweeps DRAFT bookings older than the TTL and flips them to EXPIRED,
 * emitting one outbox event per row. Idempotent — re-running on the
 * same set is a no-op (no DRAFT rows match anymore).
 *
 * Extracted as a service so the worker stays a thin BullMQ shell and
 * unit tests call sweep() directly with a FrozenClock.
 */
@Injectable()
export class BookingExpiryService {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly repo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @InjectPinoLogger(BookingExpiryService.name)
    private readonly logger: PinoLogger,
  ) {}

  async sweep(): Promise<{ expired: number }> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - BOOKING_DRAFT_TTL_MS);

    const expired = await this.tx.run(async (tx) => {
      const rows = await this.repo.expireDraftsOlderThan(tx, cutoff, now);
      for (const booking of rows) {
        const payload: BookingExpiredPayload = {
          bookingId: booking.id,
          expiredAt: now.toISOString(),
        };
        await this.outbox.write(tx, {
          aggregateType: "Booking",
          aggregateId: booking.id,
          eventType: BOOKING_EVENT_TYPES.EXPIRED,
          payload,
        });
      }
      return rows;
    });

    if (expired.length > 0) {
      this.logger.info({ expired: expired.length }, "draft bookings expired");
    }
    return { expired: expired.length };
  }
}
