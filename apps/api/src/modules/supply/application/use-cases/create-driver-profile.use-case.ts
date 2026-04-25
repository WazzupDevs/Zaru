import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import { PiiHasher } from "../../../../common/security/pii-hasher";
import { calculateAge } from "../../domain/age";
import { MIN_DRIVER_AGE_YEARS } from "../../domain/driver-onboarding.constants";
import { DriverProfileAlreadyExistsError } from "../../domain/errors/driver-profile-already-exists.error";
import { DriverUnderageError } from "../../domain/errors/driver-underage.error";
import { NationalIdAlreadyRegisteredError } from "../../domain/errors/national-id-already-registered.error";
import {
  DRIVER_PROFILE_CREATED_EVENT_TYPE,
  type DriverProfileCreatedEventPayload,
} from "../../domain/events/driver-profile-created.event";
import { IbanVO } from "../../domain/value-objects/iban.vo";
import { NationalIdVO } from "../../domain/value-objects/national-id.vo";
import {
  DRIVER_PROFILE_REPOSITORY_PORT,
  type DriverProfileRecord,
  type DriverProfileRepositoryPort,
} from "../ports/driver-profile.repository.port";

export interface CreateDriverProfileInput {
  firstName: string;
  lastName: string;
  nationalId: string;
  birthDate: Date;
  iban: string;
}

@Injectable()
export class CreateDriverProfileUseCase {
  constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY_PORT)
    private readonly repo: DriverProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly pii: PiiHasher,
  ) {}

  async execute(
    input: CreateDriverProfileInput,
    actor: { userId: string },
  ): Promise<DriverProfileRecord> {
    const nationalId = NationalIdVO.create(input.nationalId);
    const iban = IbanVO.create(input.iban);

    const now = this.clock.now();
    const age = calculateAge(input.birthDate, now);
    if (age < MIN_DRIVER_AGE_YEARS) throw new DriverUnderageError(age);

    const nationalIdHash = this.pii.hashNationalId(nationalId.value);
    const ibanHash = await this.pii.hashIban(iban.fullIban);

    return this.tx.run(async (tx) => {
      const existingForUser = await this.repo.findActiveByUserId(tx, actor.userId);
      if (existingForUser) throw new DriverProfileAlreadyExistsError();

      const existingForTckn = await this.repo.findByNationalIdHash(tx, nationalIdHash);
      if (existingForTckn) throw new NationalIdAlreadyRegisteredError();

      const profile = await this.repo.create(tx, {
        userId: actor.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        nationalIdHash,
        birthDate: input.birthDate,
        ibanHash,
        ibanLast4: iban.last4,
      });

      await this.outbox.write(tx, {
        aggregateType: "DriverProfile",
        aggregateId: profile.id,
        eventType: DRIVER_PROFILE_CREATED_EVENT_TYPE,
        payload: {
          driverProfileId: profile.id,
          userId: profile.userId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          ibanLast4: profile.ibanLast4,
          createdAt: profile.createdAt.toISOString(),
        } satisfies DriverProfileCreatedEventPayload,
      });

      return profile;
    });
  }
}
