import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../common/prisma/prisma.service";

import type { TxRunnerPort } from "../../application/ports/tx-runner.port";
import type { TxClient } from "../../application/ports/user.repository.port";

@Injectable()
export class PrismaTxRunner implements TxRunnerPort {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    // Use the bare PrismaClient (not the soft-delete extension client) because
    // the use case wants raw control over deletedAt filters and updates inside
    // the transaction. See development-notes.md.
    return this.prisma.$transaction(async (tx) => fn(tx));
  }
}
