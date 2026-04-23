import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { DocumentType } from "@event-fleet/shared-types";

import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  StorageKeyBuilder,
  isAllowedUploadMimeType,
  mimeTypeToExtension,
} from "../../../../common/storage/storage-key-builder";
import { STORAGE_PORT, type StoragePort } from "../../../../common/storage/storage.port";
import { FileTooLargeError, UnsupportedFileTypeError } from "../../domain/errors/document-errors";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import { VehicleNotFoundError } from "../../domain/errors/vehicle-not-found.error";
import {
  DOCUMENT_REPOSITORY_PORT,
  type DocumentRepositoryPort,
} from "../ports/document.repository.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";
import {
  VEHICLE_REPOSITORY_PORT,
  type VehicleRepositoryPort,
} from "../ports/vehicle.repository.port";

import type { Env } from "../../../../config/env";

const UPLOAD_URL_TTL_SECONDS = 900; // 15 minutes

export interface RequestDocumentUploadInput {
  type: DocumentType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  vehicleId?: string | undefined;
  issuedAt?: Date | undefined;
  expiresAt?: Date | undefined;
}

export interface RequestDocumentUploadResult {
  documentId: string;
  uploadUrl: string;
  publicUrl: string;
  expiresAt: Date;
  maxSizeBytes: number;
}

@Injectable()
export class RequestDocumentUploadUseCase {
  private readonly maxFileSize: number;

  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(VEHICLE_REPOSITORY_PORT)
    private readonly vehicleRepo: VehicleRepositoryPort,
    @Inject(DOCUMENT_REPOSITORY_PORT)
    private readonly documentRepo: DocumentRepositoryPort,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    config: ConfigService<Env, true>,
  ) {
    this.maxFileSize = config.get("STORAGE_MAX_FILE_SIZE_BYTES", { infer: true });
  }

  async execute(
    input: RequestDocumentUploadInput,
    actor: { userId: string },
  ): Promise<RequestDocumentUploadResult> {
    if (!isAllowedUploadMimeType(input.mimeType)) {
      throw new UnsupportedFileTypeError(input.mimeType);
    }
    if (input.fileSize <= 0 || input.fileSize > this.maxFileSize) {
      throw new FileTooLargeError(this.maxFileSize, input.fileSize);
    }
    const ext = mimeTypeToExtension(input.mimeType);

    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new DriverProfileNotFoundError();
      if (input.vehicleId !== undefined) {
        const vehicle = await this.vehicleRepo.findActiveById(tx, input.vehicleId);
        if (vehicle?.driverProfileId !== profile.id) throw new VehicleNotFoundError();
      }

      const documentId = randomUUID();
      const key = StorageKeyBuilder.driverDocument(profile.id, documentId, ext);

      // Presigned URL is created OUTSIDE the DB write atomic boundary —
      // S3 sees no transaction. The DB row records that we issued a
      // presigned URL; if the caller never uploads, the document stays
      // UPLOADED-status but the storage object is missing (confirm step
      // catches it with HEAD request).
      const presigned = await this.storage.createPresignedUploadUrl({
        key,
        contentType: input.mimeType,
        maxSizeBytes: input.fileSize,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });

      await this.documentRepo.create(tx, {
        id: documentId,
        driverProfileId: profile.id,
        vehicleId: input.vehicleId,
        type: input.type,
        storageKey: key,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
      });

      return {
        documentId,
        uploadUrl: presigned.uploadUrl,
        publicUrl: presigned.publicUrl,
        expiresAt: presigned.expiresAt,
        maxSizeBytes: presigned.maxSizeBytes,
      };
    });
  }
}
