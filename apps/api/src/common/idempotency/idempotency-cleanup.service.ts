import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Hard-deletes IdempotencyRecord rows whose TTL has elapsed.
 * Service extracted so unit tests call sweep() directly without
 * standing up a BullMQ worker.
 */
@Injectable()
export class IdempotencyCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(IdempotencyCleanupService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** Returns the number of rows deleted. */
  async sweep(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.client.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    if (result.count > 0) {
      this.logger.info({ deleted: result.count }, "idempotency records cleaned up");
    }
    return result.count;
  }
}
