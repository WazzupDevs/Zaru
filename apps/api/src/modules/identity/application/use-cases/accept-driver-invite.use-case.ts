import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { PiiHasher } from "../../../../common/security/pii-hasher";
import { DriverNotInvitedError } from "../../domain/errors/driver-not-invited.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import {
  DRIVER_INVITE_REPOSITORY_PORT,
  type DriverInviteRepositoryPort,
} from "../ports/driver-invite.repository.port";
import { USER_REPOSITORY_PORT, type UserRepositoryPort } from "../ports/user.repository.port";

export interface AcceptDriverInviteInput {
  phone: string;
  userId: string;
}

/**
 * Final step of the driver OTP verify flow. Atomically:
 *   1. Marks the matching DriverInvite ACCEPTED
 *   2. Promotes User.role from CUSTOMER (default) to DRIVER
 *   3. Writes a `identity.DriverInviteAccepted` outbox event
 *
 * What this DOES NOT do: provision a DriverProfile. The supply module
 * owns that flow (CreateDriverProfileUseCase) because it needs TCKN +
 * IBAN + birth date the driver hasn't given yet. The driver app's
 * home screen reads driver-profile state and prompts onboarding when
 * the row is missing.
 *
 * Idempotent: if the invite is already ACCEPTED for this same user,
 * we no-op and return — the verifyOtp flow may retry on duplicate
 * deliveries. A different acceptedUserId on an ACCEPTED row throws
 * (defensive against admin re-invite + a different phone winning the
 * race).
 */
@Injectable()
export class AcceptDriverInviteUseCase {
  constructor(
    @Inject(DRIVER_INVITE_REPOSITORY_PORT)
    private readonly inviteRepo: DriverInviteRepositoryPort,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT)
    private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    private readonly hasher: PiiHasher,
  ) {}

  async execute(input: AcceptDriverInviteInput): Promise<void> {
    const phoneE164Hash = this.hasher.hashPhone(input.phone);
    const at = this.clock.now();

    await this.tx.run(async (tx) => {
      const invite = await this.inviteRepo.findActiveByPhoneHash(tx, phoneE164Hash);
      if (!invite) {
        throw new DriverNotInvitedError("phone is not on the driver whitelist");
      }

      // Idempotent path — same user re-accepting (e.g., verifyOtp retry).
      if (invite.status === "ACCEPTED") {
        if (invite.acceptedUserId === input.userId) return;
        // Different user holds the accepted row — defensive throw.
        throw new DriverNotInvitedError("invite already accepted by another user");
      }

      if (invite.status !== "PENDING") {
        // REVOKED — covered by CheckDriverWhitelistUseCase upstream too.
        throw new DriverNotInvitedError("invite is no longer accepting drivers");
      }

      const user = await this.userRepo.findActiveById(tx, input.userId);
      if (!user) throw new UserNotFoundError("user not found during invite acceptance");

      const accepted = await this.inviteRepo.markAccepted(tx, {
        id: invite.id,
        acceptedUserId: input.userId,
        acceptedAt: at,
      });
      if (!accepted) {
        // Another concurrent acceptance won the race — re-read and
        // surface as already-accepted.
        throw new DriverNotInvitedError("invite was already accepted concurrently");
      }

      await this.userRepo.updateRole(tx, input.userId, "DRIVER");

      await this.outbox.write(tx, {
        aggregateType: "DriverInvite",
        aggregateId: invite.id,
        eventType: "identity.DriverInviteAccepted",
        payload: {
          inviteId: invite.id,
          userId: input.userId,
          acceptedAt: at.toISOString(),
        },
      });
    });
  }
}
