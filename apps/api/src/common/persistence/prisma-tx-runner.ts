import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import type { TxClient } from "./tx-client";
import type { TxRunnerPort } from "./tx-runner.port";

@Injectable()
export class PrismaTxRunner implements TxRunnerPort {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    // Use the bare PrismaClient (not the soft-delete extension client) so
    // use cases can choose when to bypass the deletedAt filter inside a
    // transaction. See development-notes.md "Prisma soft-delete extension".
    return this.prisma.$transaction(async (tx) => fn(tx));
  }
}
