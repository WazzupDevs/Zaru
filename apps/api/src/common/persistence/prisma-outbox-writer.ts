import { Injectable } from "@nestjs/common";

import type { OutboxEventInput, OutboxWriterPort } from "./outbox-writer.port";
import type { TxClient } from "./tx-client";

@Injectable()
export class PrismaOutboxWriter implements OutboxWriterPort {
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
}
