import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { ValidationError } from "../../../../common/errors/domain-error";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  DocumentAlreadyReviewedError,
  DocumentNotFoundError,
} from "../../domain/errors/document-errors";
import {
  DOCUMENT_REVIEWED_EVENT_TYPE,
  type DocumentReviewedEventPayload,
} from "../../domain/events/document-reviewed.event";
import {
  DOCUMENT_REPOSITORY_PORT,
  type DocumentRecord,
  type DocumentRepositoryPort,
} from "../ports/document.repository.port";

export interface ReviewDocumentInput {
  decision: "APPROVE" | "REJECT";
  rejectionReason?: string;
}

@Injectable()
export class ReviewDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY_PORT)
    private readonly documentRepo: DocumentRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(
    documentId: string,
    input: ReviewDocumentInput,
    admin: { userId: string },
  ): Promise<DocumentRecord> {
    if (
      input.decision === "REJECT" &&
      (!input.rejectionReason || input.rejectionReason.length < 5)
    ) {
      throw new ValidationError("rejectionReason is required when rejecting a document.");
    }

    return this.tx.run(async (tx) => {
      const doc = await this.documentRepo.findActiveById(tx, documentId);
      if (!doc) throw new DocumentNotFoundError();
      if (doc.status === "APPROVED" || doc.status === "REJECTED") {
        throw new DocumentAlreadyReviewedError();
      }

      const now = this.clock.now();
      const decision: "APPROVED" | "REJECTED" =
        input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const rejectionReason = decision === "REJECTED" ? (input.rejectionReason ?? null) : null;

      await this.documentRepo.review(tx, doc.id, {
        reviewedByUserId: admin.userId,
        reviewedAt: now,
        decision,
        rejectionReason,
      });

      await this.outbox.write(tx, {
        aggregateType: "Document",
        aggregateId: doc.id,
        eventType: DOCUMENT_REVIEWED_EVENT_TYPE,
        payload: {
          documentId: doc.id,
          driverProfileId: doc.driverProfileId,
          reviewedByUserId: admin.userId,
          decision,
          rejectionReason,
          reviewedAt: now.toISOString(),
        } satisfies DocumentReviewedEventPayload,
      });

      const updated = await this.documentRepo.findActiveById(tx, doc.id);
      if (!updated) throw new DocumentNotFoundError();
      return updated;
    });
  }
}
