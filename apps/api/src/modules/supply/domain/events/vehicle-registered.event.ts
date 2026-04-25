export const VEHICLE_REGISTERED_EVENT_TYPE = "supply.VehicleRegistered";

export interface VehicleRegisteredEventPayload {
  vehicleId: string;
  driverProfileId: string;
  vehicleTypeId: string;
  plateNumber: string;
  brand: string;
  model: string;
  year: number;
  registeredAt: string;
}
