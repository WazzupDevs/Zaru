import type { DocumentStatus, DocumentType } from "@event-fleet/shared-types";

import type { TxClient } from "../../../../common/persistence/tx-client";

export const DOCUMENT_REPOSITORY_PORT = Symbol("DOCUMENT_REPOSITORY_PORT");

export interface DocumentRecord {
  id: string;
  driverProfileId: string;
  vehicleId: string | null;
  type: DocumentType;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  rejectionReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateDocumentRow {
  id: string;
  driverProfileId: string;
  vehicleId?: string | undefined;
  type: DocumentType;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  issuedAt?: Date | undefined;
  expiresAt?: Date | undefined;
}

export interface ReviewDocumentInput {
  reviewedByUserId: string;
  reviewedAt: Date;
  decision: "APPROVED" | "REJECTED";
  rejectionReason: string | null;
}

export interface DocumentRepositoryPort {
  create(tx: TxClient, input: CreateDocumentRow): Promise<DocumentRecord>;
  findActiveById(tx: TxClient, id: string): Promise<DocumentRecord | null>;
  listByDriver(tx: TxClient, driverProfileId: string): Promise<DocumentRecord[]>;
  /** Distinct types currently UPLOADED or APPROVED for a driver. */
  listExistingTypesForDriver(tx: TxClient, driverProfileId: string): Promise<DocumentType[]>;
  review(tx: TxClient, id: string, input: ReviewDocumentInput): Promise<void>;
  delete(tx: TxClient, id: string, deletedAt: Date): Promise<void>;
}
