import { Inject, Injectable } from "@nestjs/common";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  PRICING_PROFILE_REPOSITORY_PORT,
  type PricingProfileRepositoryPort,
  type UpsertPricingProfileInput,
} from "../ports/pricing-profile.repository.port";

import type { PricingProfileEntity } from "../../domain/entities/pricing-types";

const PRICING_PROFILE_UPSERTED_EVENT_TYPE = "pricing.PricingProfileUpserted";

@Injectable()
export class UpsertPricingProfileUseCase {
  constructor(
    @Inject(PRICING_PROFILE_REPOSITORY_PORT)
    private readonly repo: PricingProfileRepositoryPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async execute(
    input: UpsertPricingProfileInput,
    admin: { userId: string },
  ): Promise<PricingProfileEntity> {
    return this.tx.run(async (tx) => {
      const profile = await this.repo.upsert(tx, input);
      await this.outbox.write(tx, {
        aggregateType: "PricingProfile",
        aggregateId: profile.id,
        eventType: PRICING_PROFILE_UPSERTED_EVENT_TYPE,
        payload: {
          profileId: profile.id,
          vehicleTypeId: profile.vehicleTypeId,
          baseFee: profile.baseFee,
          perKmFee: profile.perKmFee,
          perHourFee: profile.perHourFee,
          minimumHours: profile.minimumHours,
          includedKm: profile.includedKm,
          isActive: profile.isActive,
          updatedByUserId: admin.userId,
          updatedAt: this.clock.now().toISOString(),
        },
      });
      return profile;
    });
  }
}
