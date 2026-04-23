import type { TxClient } from "./tx-client";

export const OUTBOX_WRITER_PORT = Symbol("OUTBOX_WRITER_PORT");

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  // Domain payload — JSON-serializable. Contract: anything that survives
  // a JSON.stringify round-trip. Use case authors are expected to pass a
  // typed value object that satisfies their event's payload interface.
  payload: object;
}

/**
 * Boundary so use cases can write outbox events without depending on Prisma.
 * Implementation MUST run inside the caller's transaction (the `tx` arg) so
 * the event row commits atomically with the aggregate change. ADR 0004.
 */
export interface OutboxWriterPort {
  write(tx: TxClient, event: OutboxEventInput): Promise<void>;
}
