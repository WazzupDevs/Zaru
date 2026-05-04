/**
 * Booking domain event payloads. These are the JSON shapes written to the
 * outbox — they go to BullMQ, downstream consumers, and analytics.
 *
 * PII discipline (see development-notes "Outbox PII"):
 *   - bookingId, customerId, role/actor markers — OK
 *   - totalAmount, currency, vehicleTypeId, eventStartAt — OK (commerce data)
 *   - pickup/dropoff lat/lng/address — NEVER (consumer can hydrate from
 *     the booking row if it has the right scope)
 *   - cancellationReason — NEVER (free-text customer input)
 */

export const BOOKING_EVENT_TYPES = {
  CREATED: "booking.BookingCreated",
  CONFIRMED: "booking.BookingConfirmed",
  DRIVER_ASSIGNED: "booking.BookingDriverAssigned",
  STARTED: "booking.BookingStarted",
  COMPLETED: "booking.BookingCompleted",
  CANCELLED: "booking.BookingCancelled",
  EXPIRED: "booking.BookingExpired",
} as const;

export type BookingEventType = (typeof BOOKING_EVENT_TYPES)[keyof typeof BOOKING_EVENT_TYPES];

export interface BookingCreatedPayload {
  bookingId: string;
  customerId: string;
  vehicleTypeId: string;
  categoryId: string;
  totalAmount: string; // Decimal serialized as string
  currency: string;
  eventStartAt: string; // ISO
  eventEndAt: string; // ISO
}

export interface BookingConfirmedPayload {
  bookingId: string;
  customerId: string;
  confirmedAt: string; // ISO
}

export interface BookingCancelledPayload {
  bookingId: string;
  cancelledByUserId: string;
  cancelledByRole: "CUSTOMER" | "DRIVER" | "ADMIN" | "SYSTEM";
  previousStatus: string;
  cancelledAt: string; // ISO
}

export interface BookingExpiredPayload {
  bookingId: string;
  expiredAt: string; // ISO
}
