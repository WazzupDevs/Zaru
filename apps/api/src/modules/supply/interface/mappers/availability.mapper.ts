import type { AvailabilityResponse } from "@event-fleet/shared-types";

import type { AvailabilityRecord } from "../../application/ports/vehicle-availability.repository.port";

export function toAvailabilityResponse(rec: AvailabilityRecord): AvailabilityResponse {
  return {
    id: rec.id,
    vehicleId: rec.vehicleId,
    driverProfileId: rec.driverProfileId,
    startAt: rec.startAt.toISOString(),
    endAt: rec.endAt.toISOString(),
    type: rec.type,
    bookingId: rec.bookingId,
    reason: rec.reason,
    createdAt: rec.createdAt.toISOString(),
  };
}
