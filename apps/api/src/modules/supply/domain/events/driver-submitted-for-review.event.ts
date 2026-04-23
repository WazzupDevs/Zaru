export const DRIVER_SUBMITTED_FOR_REVIEW_EVENT_TYPE = "supply.DriverSubmittedForReview";

export interface DriverSubmittedForReviewEventPayload {
  driverProfileId: string;
  userId: string;
  submittedAt: string;
}
