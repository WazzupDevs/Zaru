import { Inject, Injectable } from "@nestjs/common";

import { ForbiddenError } from "../../../../common/errors/domain-error";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { PiiHasher } from "../../../../common/security/pii-hasher";
import { InvalidPhoneError } from "../../domain/errors/invalid-phone.error";
import {
  DRIVER_INVITE_REPOSITORY_PORT,
  type DriverInviteRecord,
  type DriverInviteRepositoryPort,
} from "../ports/driver-invite.repository.port";

const TR_MOBILE_PATTERN = /^\+90(5)\d{9}$/;

export interface CreateDriverInviteInput {
  phone: string;
  notes?: string | null;
}

export interface CreateDriverInviteActor {
  userId: string;
  role: string;
}

/**
 * Idempotent on (phone, status=PENDING) — re-inviting a phone that
 * already has an open invite returns the existing row. A new invite
 * IS created when the previous one was REVOKED or ACCEPTED (re-onboard
 * scenario; the soft-deleted REVOKED row stays as audit evidence).
 */
@Injectable()
export class CreateDriverInviteUseCase {
  constructor(
    @Inject(DRIVER_INVITE_REPOSITORY_PORT)
    private readonly repo: DriverInviteRepositoryPort,
    @Inject(TX_RUNNER_PORT)
    private readonly tx: TxRunnerPort,
    private readonly hasher: PiiHasher,
  ) {}

  async execute(
    input: CreateDriverInviteInput,
    actor: CreateDriverInviteActor,
  ): Promise<DriverInviteRecord> {
    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("only admins can create driver invites");
    }
    if (!TR_MOBILE_PATTERN.test(input.phone)) {
      throw new InvalidPhoneError("phone must be TR mobile in E.164");
    }

    const phoneE164Hash = this.hasher.hashPhone(input.phone);

    return this.tx.run(async (tx) => {
      const existing = await this.repo.findActiveByPhoneHash(tx, phoneE164Hash);
      if (existing?.status === "PENDING") {
        return existing;
      }
      return this.repo.create(tx, {
        phoneE164: input.phone,
        phoneE164Hash,
        invitedByAdminId: actor.userId,
        notes: input.notes ?? null,
      });
    });
  }
}
