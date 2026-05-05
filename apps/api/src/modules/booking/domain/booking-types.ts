import type { BookingStatus as PrismaBookingStatus } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

export type BookingStatus = PrismaBookingStatus;

/**
 * Domain entity for a Booking. Decimal money fields are kept as
 * @prisma/client/runtime/library Decimal — the same type the Prisma row
 * returns — so the use case can hand them straight back without lossy
 * conversion. The HTTP mapper converts to string for the wire format.
 */
export interface BookingEntity {
  id: string;
  customerId: string;
  priceQuoteId: string;
  status: BookingStatus;

  // Snapshot from quote (immutable price guarantee).
  vehicleTypeId: string;
  categoryId: string;
  pickupLat: Decimal;
  pickupLng: Decimal;
  pickupAddress: string;
  dropoffLat: Decimal;
  dropoffLng: Decimal;
  dropoffAddress: string;
  eventStartAt: Date;
  eventEndAt: Date;
  totalAmount: Decimal;
  currency: string;

  // Lifecycle audit.
  confirmedAt: Date | null;
  driverAssignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  expiredAt: Date | null;

  // Cancellation context.
  cancellationReason: string | null;
  cancelledByUserId: string | null;

  // Driver / vehicle (set by Dispatch in A4d).
  driverId: string | null;
  vehicleId: string | null;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}
