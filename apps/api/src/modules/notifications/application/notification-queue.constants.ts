/**
 * Queue + job name constants live in application so use cases can
 * reference them without crossing into infrastructure (ESLint
 * cross-layer guard, ADR 0005). The worker re-exports the same
 * symbols.
 */
export const NOTIFICATION_QUEUE_NAME = "notifications";
export const SEND_NOTIFICATION_JOB = "send";
