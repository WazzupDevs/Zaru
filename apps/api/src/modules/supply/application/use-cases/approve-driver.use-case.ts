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
  DRIVER_APPROVED_EVENT_TYPE,
  type DriverApprovedEventPayload,
} from "../../domain/events/driver-approved.event";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRecord,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

@Injectable()
export class ApproveDriverUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly repo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(profileId: string, admin: { userId: string }): Promise<DriverProfileRecord> {
    return this.tx.run(async (tx) => {
      const profile = await this.repo.findActiveById(tx, profileId);
      if (!profile) throw new DriverProfileNotFoundError();
      if (profile.status !== "DOCUMENTS_PENDING") {
        throw new InvalidDriverStatusTransitionError(profile.status, "APPROVED");
      }
      const now = this.clock.now();
      await this.repo.setStatus(tx, profile.id, {
        status: "APPROVED",
        approvedAt: now,
        approvedByUserId: admin.userId,
      });
      // Cross-module write: promote the user's role so the JWT issued on the
      // next login carries DRIVER. Same tx so we never have a half-committed
      // state where status=APPROVED but role=CUSTOMER. ADR 0005 permits this
      // explicit write — the alternative (event-driven role promotion) would
      // open an "approved but not yet promoted" window. Identity owns the
      // model schema; we just bump a column here.
      await tx.user.update({ where: { id: profile.userId }, data: { role: "DRIVER" } });

      await this.outbox.write(tx, {
        aggregateType: "DriverProfile",
        aggregateId: profile.id,
        eventType: DRIVER_APPROVED_EVENT_TYPE,
        payload: {
          driverProfileId: profile.id,
          userId: profile.userId,
          approvedByUserId: admin.userId,
          approvedAt: now.toISOString(),
        } satisfies DriverApprovedEventPayload,
      });

      const updated = await this.repo.findActiveById(tx, profile.id);
      if (!updated) throw new DriverProfileNotFoundError();
      return updated;
    });
  }
}
