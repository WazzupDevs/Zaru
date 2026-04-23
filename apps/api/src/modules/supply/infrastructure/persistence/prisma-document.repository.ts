import { Injectable } from "@nestjs/common";

import type { DocumentType } from "@event-fleet/shared-types";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type {
  CreateDocumentRow,
  DocumentRecord,
  DocumentRepositoryPort,
  ReviewDocumentInput,
} from "../../application/ports/document.repository.port";

@Injectable()
export class PrismaDocumentRepository implements DocumentRepositoryPort {
  async create(tx: TxClient, input: CreateDocumentRow): Promise<DocumentRecord> {
    const row = await tx.document.create({
      data: {
        id: input.id,
        driverProfileId: input.driverProfileId,
        ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
        type: input.type,
        storageKey: input.storageKey,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      },
    });
    return toRecord(row);
  }

  async findActiveById(tx: TxClient, id: string): Promise<DocumentRecord | null> {
    const row = await tx.document.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async listByDriver(tx: TxClient, driverProfileId: string): Promise<DocumentRecord[]> {
    const rows = await tx.document.findMany({
      where: { driverProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toRecord);
  }

  async listExistingTypesForDriver(tx: TxClient, driverProfileId: string): Promise<DocumentType[]> {
    const rows = await tx.document.findMany({
      where: {
        driverProfileId,
        deletedAt: null,
        status: { in: ["UPLOADED", "APPROVED"] },
      },
      select: { type: true },
      distinct: ["type"],
    });
    return rows.map((r) => r.type);
  }

  async review(tx: TxClient, id: string, input: ReviewDocumentInput): Promise<void> {
    await tx.document.update({
      where: { id },
      data: {
        status: input.decision,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: input.reviewedAt,
        rejectionReason: input.rejectionReason,
      },
    });
  }

  async delete(tx: TxClient, id: string, deletedAt: Date): Promise<void> {
    await tx.document.update({ where: { id }, data: { deletedAt } });
  }
}

function toRecord(
  row: Awaited<ReturnType<TxClient["document"]["findFirstOrThrow"]>>,
): DocumentRecord {
  return {
    id: row.id,
    driverProfileId: row.driverProfileId,
    vehicleId: row.vehicleId,
    type: row.type,
    storageKey: row.storageKey,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    status: row.status,
    rejectionReason: row.rejectionReason,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
