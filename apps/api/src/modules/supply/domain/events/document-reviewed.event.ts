export const DOCUMENT_REVIEWED_EVENT_TYPE = "supply.DocumentReviewed";

export interface DocumentReviewedEventPayload {
  documentId: string;
  driverProfileId: string;
  reviewedByUserId: string;
  decision: "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedAt: string;
}
