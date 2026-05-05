export const PRICE_QUOTE_CLEANUP_QUEUE_NAME = "price-quote-cleanup";
export const PRICE_QUOTE_CLEANUP_JOB = "expire";
/** Tick every minute — quote TTL is 15 minutes, this gives at-most ~60s slack. */
export const PRICE_QUOTE_CLEANUP_INTERVAL_MS = 60_000;
