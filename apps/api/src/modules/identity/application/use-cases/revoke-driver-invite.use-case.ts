import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import { ForbiddenError } from "../../../../common/errors/domain-error";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { DriverInviteAlreadyAcceptedError } from "../../domain/errors/driver-invite-already-accepted.error";
import { DriverInviteNotFoundError } from "../../domain/errors/driver-invite-not-found.error";
import {
  DRIVER_INVITE_REPOSITORY_PORT,
  type DriverInviteRepositoryPort,
} from "../ports/driver-invite.repository.port";

export interface RevokeDriverInviteInput {
  inviteId: string;
}

export interface RevokeDriverInviteActor {
  role: string;
}

/**
 * PENDING → REVOKED + soft delete. ACCEPTED invites can't be revoked
 * here — once a User row exists with role=DRIVER, the deactivation
 * flow lives in supply (Faz 3+). Throwing
 * DriverInviteAlreadyAcceptedError makes the failure mode explicit.
 */
@Injectable()
export class RevokeDriverInviteUseCase {
  constructor(
    @Inject(DRIVER_INVITE_REPOSITORY_PORT)
    private readonly repo: DriverInviteRepositoryPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  async execute(input: RevokeDriverInviteInput, actor: RevokeDriverInviteActor): Promise<void> {
    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("only admins can revoke driver invites");
    }
    const at = this.clock.now();

    await this.tx.run(async (tx) => {
      const invite = await this.repo.findById(tx, input.inviteId);
      if (!invite) throw new DriverInviteNotFoundError("driver invite not found");
      if (invite.status === "ACCEPTED") {
        throw new DriverInviteAlreadyAcceptedError(
          "cannot revoke an accepted invite; use the supply driver-deactivate flow",
        );
      }
      // Already REVOKED → no-op (idempotent).
      if (invite.status === "REVOKED") return;
      await this.repo.markRevoked(tx, invite.id, at);
    });
  }
}
