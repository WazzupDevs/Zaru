import type { DocumentType } from "@event-fleet/shared-types";

export const DOCUMENT_UPLOADED_EVENT_TYPE = "supply.DocumentUploaded";

export interface DocumentUploadedEventPayload {
  documentId: string;
  driverProfileId: string;
  vehicleId: string | null;
  type: DocumentType;
  storageKey: string;
  uploadedAt: string;
}
