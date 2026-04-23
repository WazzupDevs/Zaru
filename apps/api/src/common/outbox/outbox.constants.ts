export const OUTBOX_QUEUE_NAME = "outbox";
export const OUTBOX_DRAIN_JOB = "drain";

/** Worker tuning constants — single source of truth, exported for tests. */
export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_MAX_RETRIES = 10;
/** Repeatable interval for the drain job (ms). */
export const OUTBOX_DRAIN_INTERVAL_MS = 1000;
