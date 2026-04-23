export const IDEMPOTENCY_CLEANUP_QUEUE_NAME = "idempotency-cleanup";
export const IDEMPOTENCY_CLEANUP_JOB = "cleanup";
/** Repeatable interval (ms). 1 hour is plenty — TTL is 7 days. */
export const IDEMPOTENCY_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
