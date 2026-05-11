import { Inject, Injectable } from "@nestjs/common";

import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { PiiHasher } from "../../../../common/security/pii-hasher";
import {
  DRIVER_INVITE_REPOSITORY_PORT,
  type DriverInviteRepositoryPort,
} from "../ports/driver-invite.repository.port";

export interface CheckDriverWhitelistResult {
  isWhitelisted: boolean;
  inviteId: string | null;
}

/**
 * Whitelist gate for the driver OTP request endpoint. Returns true
 * only when there is a PENDING (non-soft-deleted) invite for the
 * phone hash. ACCEPTED invites also return false here — the driver
 * already has a User row, the auth flow uses standard verifyOtp
 * after the gate passes; we don't want a re-accept loop.
 */
@Injectable()
export class CheckDriverWhitelistUseCase {
  constructor(
    @Inject(DRIVER_INVITE_REPOSITORY_PORT)
    private readonly repo: DriverInviteRepositoryPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
    private readonly hasher: PiiHasher,
  ) {}

  async execute(input: { phone: string }): Promise<CheckDriverWhitelistResult> {
    const phoneE164Hash = this.hasher.hashPhone(input.phone);
    const invite = await this.tx.run((tx) => this.repo.findActiveByPhoneHash(tx, phoneE164Hash));
    if (!invite) return { isWhitelisted: false, inviteId: null };
    if (invite.status === "PENDING") {
      return { isWhitelisted: true, inviteId: invite.id };
    }
    // ACCEPTED — driver already exists; whitelist gate doesn't re-fire.
    // The standard /auth/otp/verify flow handles the returning login.
    if (invite.status === "ACCEPTED") {
      return { isWhitelisted: true, inviteId: invite.id };
    }
    // REVOKED or anything else.
    return { isWhitelisted: false, inviteId: null };
  }
}
