import type { PrismaClient } from "@prisma/client";

/**
 * Transaction-scoped Prisma client. Use cases pass this to repositories
 * instead of injecting PrismaService directly. Lives in common because
 * every module that writes to the database needs it.
 */
export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
