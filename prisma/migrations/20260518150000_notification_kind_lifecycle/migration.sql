-- A4f-2b-2 — extend NotificationKind enum with three lifecycle values
-- the new event handlers emit to customers:
--   DRIVER_ON_THE_WAY     — driver tapped Yola Çık
--   DRIVER_ARRIVED        — driver tapped Vardım
--   BOOKING_COMPLETED     — driver tapped İşi Bitir
--
-- DRIVER_ASSIGNED_TO_BOOKING still exists — it now fires off
-- dispatch.DriverOfferAccepted (rather than the legacy
-- dispatch.DriverDispatched, which under the offer flow only means
-- "a driver has been offered the booking"). Both events go through
-- the same QueueNotificationUseCase + idempotency window.

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DRIVER_ON_THE_WAY';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DRIVER_ARRIVED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'BOOKING_COMPLETED';
