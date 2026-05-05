import type { BookingResponse } from "@event-fleet/shared-types";

import type { BookingEntity } from "../../domain/booking-types";

export function toBookingResponse(b: BookingEntity): BookingResponse {
  return {
    id: b.id,
    customerId: b.customerId,
    priceQuoteId: b.priceQuoteId,
    status: b.status,
    vehicleTypeId: b.vehicleTypeId,
    categoryId: b.categoryId,
    pickupAddress: b.pickupAddress,
    dropoffAddress: b.dropoffAddress,
    eventStartAt: b.eventStartAt.toISOString(),
    eventEndAt: b.eventEndAt.toISOString(),
    // Prisma Decimal `.toString()` drops trailing zeros ("6877" not
    // "6877.00"). The shared-types contract is "always two decimal
    // places"; Number → toFixed(2) enforces that on the wire while
    // staying robust against test fixtures that pass plain strings.
    totalAmount: Number(b.totalAmount.toString()).toFixed(2),
    currency: b.currency,
    confirmedAt: b.confirmedAt ? b.confirmedAt.toISOString() : null,
    driverAssignedAt: b.driverAssignedAt ? b.driverAssignedAt.toISOString() : null,
    startedAt: b.startedAt ? b.startedAt.toISOString() : null,
    completedAt: b.completedAt ? b.completedAt.toISOString() : null,
    cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
    expiredAt: b.expiredAt ? b.expiredAt.toISOString() : null,
    cancellationReason: b.cancellationReason,
    driverId: b.driverId,
    vehicleId: b.vehicleId,
    version: b.version,
    createdAt: b.createdAt.toISOString(),
  };
}
