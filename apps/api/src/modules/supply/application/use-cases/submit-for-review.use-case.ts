import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { REQUIRED_DOCUMENT_TYPES } from "../../domain/driver-onboarding.constants";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import { IncompleteDocumentsError } from "../../domain/errors/incomplete-documents.error";
import { InvalidDriverStatusTransitionError } from "../../domain/errors/invalid-driver-status-transition.error";
import {
  DRIVER_SUBMITTED_FOR_REVIEW_EVENT_TYPE,
  type DriverSubmittedForReviewEventPayload,
} from "../../domain/events/driver-submitted-for-review.event";
import {
  DOCUMENT_REPOSITORY_PORT,
  type DocumentRepositoryPort,
} from "../ports/document.repository.port";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

@Injectable()
export class SubmitForReviewUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: DriverProfileRepositoryPort,
    @Inject(DOCUMENT_REPOSITORY_PORT)
    private readonly documentRepo: DocumentRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(actor: { userId: string }): Promise<{ status: "DOCUMENTS_PENDING" }> {
    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByUserId(tx, actor.userId);
      if (!profile) throw new DriverProfileNotFoundError();
      if (profile.status !== "DRAFT") {
        throw new InvalidDriverStatusTransitionError(profile.status, "DOCUMENTS_PENDING");
      }

      const existingTypes = await this.documentRepo.listExistingTypesForDriver(tx, profile.id);
      const present = new Set(existingTypes);
      const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !present.has(t));
      if (missing.length > 0) throw new IncompleteDocumentsError([...missing]);

      const now = this.clock.now();
      await this.profileRepo.setStatus(tx, profile.id, { status: "DOCUMENTS_PENDING" });
      await this.outbox.write(tx, {
        aggregateType: "DriverProfile",
        aggregateId: profile.id,
        eventType: DRIVER_SUBMITTED_FOR_REVIEW_EVENT_TYPE,
        payload: {
          driverProfileId: profile.id,
          userId: profile.userId,
          submittedAt: now.toISOString(),
        } satisfies DriverSubmittedForReviewEventPayload,
      });

      return { status: "DOCUMENTS_PENDING" as const };
    });
  }
}
