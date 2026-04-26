export const AVAILABILITY_BLOCKED_EVENT_TYPE = "supply.AvailabilityBlocked";

export interface AvailabilityBlockedEventPayload {
  availabilityId: string;
  vehicleId: string;
  driverProfileId: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export const AVAILABILITY_UNBLOCKED_EVENT_TYPE = "supply.AvailabilityUnblocked";

export interface AvailabilityUnblockedEventPayload {
  availabilityId: string;
  vehicleId: string;
  driverProfileId: string;
}

export const VEHICLE_ACTIVATED_EVENT_TYPE = "supply.VehicleActivated";

export interface VehicleActivatedEventPayload {
  vehicleId: string;
  driverProfileId: string;
  activatedByUserId: string;
  activatedAt: string;
}
