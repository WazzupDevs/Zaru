// Re-export from application so worker + scheduler can keep their import
// paths local to infrastructure without breaking the cross-layer guard.
// The source of truth lives in application (used by QueueNotificationUseCase).
export {
  NOTIFICATION_QUEUE_NAME,
  SEND_NOTIFICATION_JOB,
} from "../../application/notification-queue.constants";
