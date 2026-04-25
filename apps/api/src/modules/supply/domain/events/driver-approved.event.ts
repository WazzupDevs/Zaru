export const DRIVER_APPROVED_EVENT_TYPE = "supply.DriverApproved";

export interface DriverApprovedEventPayload {
  driverProfileId: string;
  userId: string;
  approvedByUserId: string;
  approvedAt: string;
}
