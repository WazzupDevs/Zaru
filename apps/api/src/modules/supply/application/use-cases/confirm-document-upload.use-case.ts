import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { STORAGE_PORT, type StoragePort } from "../../../../common/storage/storage.port";
import {
  DocumentNotFoundError,
  UploadNotCompletedError,
  UploadSizeMismatchError,
} from "../../domain/errors/document-errors";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import {
  DOCUMENT_UPLOADED_EVENT_TYPE,
  type DocumentUploadedEventPayload,
} from "../../domain/events/document-uploaded.event";
import {
  DOCUMENT_REPOSITORY_PORT,
  type DocumentRecord,
  type DocumentRepositoryPort,
} from "../ports/document.repository.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

@Injectable()
export class ConfirmDocumentUploadUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(DOCUMENT_REPOSITORY_PORT)
    private readonly documentRepo: DocumentRepositoryPort,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(documentId: string, actor: { userId: string }): Promise<DocumentRecord> {
    // Read document + profile inside tx for snapshot consistency.
    const doc = await this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new DriverProfileNotFoundError();
      const document = await this.documentRepo.findActiveById(tx, documentId);
      if (document?.driverProfileId !== profile.id) {
        throw new DocumentNotFoundError();
      }
      return document;
    });

    // Storage HEAD lives outside the DB tx — network call, no rollback semantics.
    const meta = await this.storage.getObjectMetadata(doc.storageKey);
    if (!meta) throw new UploadNotCompletedError();
    if (meta.size !== doc.fileSize) {
      // Cleanup so the bad object doesn't linger; storage delete is safe to repeat.
      await this.storage.deleteObject(doc.storageKey);
      throw new UploadSizeMismatchError(doc.fileSize, meta.size);
    }

    // Emit DocumentUploaded so downstream (admin notification, indexer) wake up.
    await this.tx.run(async (tx) => {
      await this.outbox.write(tx, {
        aggregateType: "Document",
        aggregateId: doc.id,
        eventType: DOCUMENT_UPLOADED_EVENT_TYPE,
        payload: {
          documentId: doc.id,
          driverProfileId: doc.driverProfileId,
          vehicleId: doc.vehicleId,
          type: doc.type,
          storageKey: doc.storageKey,
          uploadedAt: this.clock.now().toISOString(),
        } satisfies DocumentUploadedEventPayload,
      });
    });

    return doc;
  }
}
