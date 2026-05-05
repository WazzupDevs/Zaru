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
    totalAmount: b.totalAmount.toString(),
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
