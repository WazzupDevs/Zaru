export const DRIVER_REJECTED_EVENT_TYPE = "supply.DriverRejected";

export interface DriverRejectedEventPayload {
  driverProfileId: string;
  userId: string;
  rejectedByUserId: string;
  rejectionReason: string;
  rejectedAt: string;
}
