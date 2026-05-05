import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRepositoryPort,
} from "../../../booking/domain/ports/booking.repository.port";
import { AssignDriverToBookingUseCase } from "../../application/use-cases/assign-driver-to-booking.use-case";

import type { Env } from "../../../../config/env";

/**
 * Sweep CONFIRMED bookings the dispatch worker can attempt right now and
 * call AssignDriverToBookingUseCase on each. Fail-isolated: one booking's
 * exception (Concurrent, NoCandidates, etc.) is logged and the loop
 * keeps going.
 *
 * Returns batch counters so the worker job can surface them in BullMQ
 * metrics + logs.
 */
@Injectable()
export class BookingDispatchService {
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;

  constructor(
    @Inject(BOOKING_REPOSITORY_PORT)
    private readonly bookingRepo: BookingRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly assignUseCase: AssignDriverToBookingUseCase,
    @InjectPinoLogger(BookingDispatchService.name)
    private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    this.maxAttempts = config.get("DISPATCH_MAX_ATTEMPTS", { infer: true });
    this.cooldownMs = config.get("DISPATCH_RETRY_COOLDOWN_MS", { infer: true });
  }

  async sweep(): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const now = this.clock.now();
    const candidates = await this.tx.run((tx) =>
      this.bookingRepo.findDispatchable(tx, {
        maxAttempts: this.maxAttempts,
        cooldownMs: this.cooldownMs,
        now,
        limit: 20,
      }),
    );

    const stats = { attempted: 0, succeeded: 0, failed: 0 };
    for (const booking of candidates) {
      stats.attempted++;
      try {
        const result = await this.assignUseCase.execute({ bookingId: booking.id });
        if (result.success) stats.succeeded++;
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

    if (stats.attempted > 0) {
      this.logger.info(stats, "dispatch sweep completed");
    }
    return stats;
  }
}
