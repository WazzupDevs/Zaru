export const BOOKING_EXPIRY_QUEUE_NAME = "booking-expiry";
export const BOOKING_EXPIRY_JOB = "expire-drafts";
/**
 * Repeat interval. Tick every minute — DRAFT TTL is 30 minutes by default,
 * a one-minute cadence is plenty for "expire shortly after the deadline"
 * without being chatty.
 */
export const BOOKING_EXPIRY_INTERVAL_MS = 60_000;
/**
 * DRAFT TTL — how long a DRAFT booking can sit before the worker flips
 * it to EXPIRED. A4b ships the worker against synthetic DRAFT rows;
 * A4c will route real ConfirmBooking output through DRAFT.
 */
export const BOOKING_DRAFT_TTL_MS = 30 * 60_000;
