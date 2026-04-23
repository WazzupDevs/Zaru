import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../common/prisma/prisma.service";

import type {
  OutboxEventInput,
  OutboxWriterPort,
} from "../../application/ports/outbox-writer.port";
import type { TxClient } from "../../application/ports/user.repository.port";

@Injectable()
export class PrismaOutboxWriter implements OutboxWriterPort {
  constructor(private readonly prisma: PrismaService) {}

  async write(tx: TxClient, event: OutboxEventInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
      },
    });
  }

  private _unused(): void {
    void this.prisma;
  }
}
