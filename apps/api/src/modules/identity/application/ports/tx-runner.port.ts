import type { TxClient } from "./user.repository.port";

export const TX_RUNNER_PORT = Symbol("TX_RUNNER_PORT");

/**
 * Lets a use case open a transaction without depending on Prisma directly.
 * The callback receives a tx-bound client that all repos in this slice
 * accept as their first argument.
 */
export interface TxRunnerPort {
  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;
}
