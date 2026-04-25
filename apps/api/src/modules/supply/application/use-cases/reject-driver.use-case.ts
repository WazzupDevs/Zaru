import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { DriverProfileNotFoundError } from "../../domain/errors/driver-profile-not-found.error";
import { InvalidDriverStatusTransitionError } from "../../domain/errors/invalid-driver-status-transition.error";
import {
  DRIVER_REJECTED_EVENT_TYPE,
  type DriverRejectedEventPayload,
} from "../../domain/events/driver-rejected.event";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRecord,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

@Injectable()
export class RejectDriverUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly repo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(
    profileId: string,
    rejectionReason: string,
    admin: { userId: string },
  ): Promise<DriverProfileRecord> {
    return this.tx.run(async (tx) => {
      const profile = await this.repo.findActiveById(tx, profileId);
      if (!profile) throw new DriverProfileNotFoundError();
      if (profile.status !== "DOCUMENTS_PENDING") {
        throw new InvalidDriverStatusTransitionError(profile.status, "REJECTED");
      }
      const now = this.clock.now();
      await this.repo.setStatus(tx, profile.id, {
        status: "REJECTED",
        rejectionReason,
      });

      await this.outbox.write(tx, {
        aggregateType: "DriverProfile",
        aggregateId: profile.id,
        eventType: DRIVER_REJECTED_EVENT_TYPE,
        payload: {
          driverProfileId: profile.id,
          userId: profile.userId,
          rejectedByUserId: admin.userId,
          rejectionReason,
          rejectedAt: now.toISOString(),
        } satisfies DriverRejectedEventPayload,
      });

      const updated = await this.repo.findActiveById(tx, profile.id);
      if (!updated) throw new DriverProfileNotFoundError();
      return updated;
    });
  }
}
