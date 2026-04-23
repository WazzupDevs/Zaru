import { Global, Module } from "@nestjs/common";

import { OUTBOX_WRITER_PORT } from "./outbox-writer.port";
import { PrismaOutboxWriter } from "./prisma-outbox-writer";
import { PrismaTxRunner } from "./prisma-tx-runner";
import { TX_RUNNER_PORT } from "./tx-runner.port";

/**
 * Global persistence ports — every module writes through TxRunnerPort
 * and OutboxWriterPort instead of injecting PrismaService directly.
 * Tests can override these per-module if they want to assert on the
 * port contract without spinning up Postgres.
 */
@Global()
@Module({
  providers: [
    { provide: TX_RUNNER_PORT, useClass: PrismaTxRunner },
    { provide: OUTBOX_WRITER_PORT, useClass: PrismaOutboxWriter },
  ],
  exports: [TX_RUNNER_PORT, OUTBOX_WRITER_PORT],
})
export class PersistenceModule {}
