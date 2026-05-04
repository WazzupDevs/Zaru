import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CLOCK_PORT, type ClockPort } from "../../../../common/clock/clock.port";
import {
  OUTBOX_WRITER_PORT,
  type OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import { TX_RUNNER_PORT, type TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import {
  RATE_LIMITER_PORT,
  type RateLimiterPort,
} from "../../../../common/rate-limit/rate-limiter.port";
import {
  InvalidAddonSelectionError,
  InvalidTimeRangeError,
  PricingProfileNotFoundError,
} from "../../domain/errors/pricing-errors";
import { PricingRateLimitedError } from "../../domain/errors/pricing-rate-limited.error";
import { PricingCalculator } from "../../domain/services/pricing-calculator.service";
import { RuleEvaluator } from "../../domain/services/rule-evaluator.service";
import { CoordinatesVO } from "../../domain/value-objects/coordinates.vo";
import { DistanceVO } from "../../domain/value-objects/distance.vo";
import { DurationVO } from "../../domain/value-objects/duration.vo";
import { breakdownToJson } from "../../domain/value-objects/price-breakdown.vo";
import {
  DISTANCE_CALCULATOR_PORT,
  type DistanceCalculatorPort,
} from "../ports/distance-calculator.port";
import {
  PRICE_QUOTE_REPOSITORY_PORT,
  type PriceQuoteEntity,
  type PriceQuoteRepositoryPort,
} from "../ports/price-quote.repository.port";
import {
  PRICING_PROFILE_REPOSITORY_PORT,
  type PricingProfileRepositoryPort,
} from "../ports/pricing-profile.repository.port";
import {
  PRICING_RULE_REPOSITORY_PORT,
  type PricingRuleRepositoryPort,
} from "../ports/pricing-rule.repository.port";

import type { Env } from "../../../../config/env";

export interface RequestPriceQuoteInput {
  vehicleTypeId: string;
  categoryId: string;
  pickupLat: number | string;
  pickupLng: number | string;
  pickupAddress: string;
  dropoffLat: number | string;
  dropoffLng: number | string;
  dropoffAddress: string;
  eventStartAt: Date;
  eventEndAt: Date;
  selectedAddonIds: string[];
}

const PRICE_QUOTE_CREATED_EVENT_TYPE = "pricing.PriceQuoteCreated";

@Injectable()
export class RequestPriceQuoteUseCase {
  private readonly ttlSeconds: number;

  constructor(
    @Inject(PRICING_PROFILE_REPOSITORY_PORT)
    private readonly profileRepo: PricingProfileRepositoryPort,
    @Inject(PRICING_RULE_REPOSITORY_PORT)
    private readonly ruleRepo: PricingRuleRepositoryPort,
    @Inject(PRICE_QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: PriceQuoteRepositoryPort,
    @Inject(DISTANCE_CALCULATOR_PORT)
    private readonly distance: DistanceCalculatorPort,
    @Inject(TX_RUNNER_PORT) private readonly tx: TxRunnerPort,
    @Inject(OUTBOX_WRITER_PORT) private readonly outbox: OutboxWriterPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(RATE_LIMITER_PORT) private readonly rateLimiter: RateLimiterPort,
    private readonly calculator: PricingCalculator,
    private readonly evaluator: RuleEvaluator,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = config.get("PRICE_QUOTE_TTL_SECONDS", { infer: true });
  }

  async execute(
    input: RequestPriceQuoteInput,
    actor: { userId: string },
  ): Promise<PriceQuoteEntity> {
    const now = this.clock.now();

    // 10/min/user — covers form double-tap + low-rate scraping. Idempotency-Key
    // is honored at the controller layer, so a legit retry doesn't burn quota.
    const limited = await this.rateLimiter.check({
      key: `rl:pricing:quote:user:${actor.userId}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      throw new PricingRateLimitedError(limited.retryAfterSeconds ?? 60);
    }

    const pickup = CoordinatesVO.create(input.pickupLat, input.pickupLng);
    const dropoff = CoordinatesVO.create(input.dropoffLat, input.dropoffLng);
    if (input.eventStartAt.getTime() < now.getTime()) {
      throw new InvalidTimeRangeError("eventStartAt is in the past");
    }
    if (input.eventEndAt.getTime() <= input.eventStartAt.getTime()) {
      throw new InvalidTimeRangeError("eventEndAt must be after eventStartAt");
    }
    const duration = DurationVO.fromMs(input.eventEndAt.getTime() - input.eventStartAt.getTime());

    // External call OUTSIDE the DB transaction. ADR 0010 / ADR 0018 disipline.
    const distanceResult = await this.distance.calculate({
      origin: pickup.toLatLng(),
      destination: dropoff.toLatLng(),
      departureTime: input.eventStartAt,
    });
    const distance = DistanceVO.fromKm(distanceResult.distanceKm);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    return this.tx.run(async (tx) => {
      const profile = await this.profileRepo.findActiveByVehicleType(tx, input.vehicleTypeId);
      if (!profile) throw new PricingProfileNotFoundError();

      const allRules = await this.ruleRepo.findActive(tx);
      const applicableRules = this.evaluator.filterApplicable(allRules, {
        eventStartAt: input.eventStartAt,
        categoryId: input.categoryId,
        vehicleTypeId: input.vehicleTypeId,
      });

      // Validate selected addons resolve to applicable ADDON rules.
      const applicableAddonIds = new Set(
        applicableRules.filter((r) => r.type === "ADDON").map((r) => r.id),
      );
      const unknownAddons = input.selectedAddonIds.filter((id) => !applicableAddonIds.has(id));
      if (unknownAddons.length > 0) throw new InvalidAddonSelectionError(unknownAddons);

      const breakdown = this.calculator.calculate({
        profile,
        distance,
        duration,
        applicableRules,
        selectedAddonIds: input.selectedAddonIds,
      });

      const quote = await this.quoteRepo.create(tx, {
        requestedByUserId: actor.userId,
        vehicleTypeId: input.vehicleTypeId,
        categoryId: input.categoryId,
        pickupLat: pickup.lat.toString(),
        pickupLng: pickup.lng.toString(),
        pickupAddress: input.pickupAddress,
        dropoffLat: dropoff.lat.toString(),
        dropoffLng: dropoff.lng.toString(),
        dropoffAddress: input.dropoffAddress,
        distanceKm: distance.km.toString(),
        durationMinutes: distanceResult.durationMinutes,
        eventStartAt: input.eventStartAt,
        eventEndAt: input.eventEndAt,
        durationHours: duration.hours.toString(),
        breakdown: breakdownToJson(breakdown),
        totalAmount: breakdown.totalAmount.toJSON().amount,
        currency: breakdown.totalAmount.currency,
        selectedAddons: input.selectedAddonIds,
        expiresAt,
      });

      // Outbox payload: NO lat/lng or address (treat location like PII).
      await this.outbox.write(tx, {
        aggregateType: "PriceQuote",
        aggregateId: quote.id,
        eventType: PRICE_QUOTE_CREATED_EVENT_TYPE,
        payload: {
          quoteId: quote.id,
          vehicleTypeId: quote.vehicleTypeId,
          categoryId: quote.categoryId,
          totalAmount: quote.totalAmount,
          currency: quote.currency,
          expiresAt: quote.expiresAt.toISOString(),
        },
      });

      return quote;
    });
  }
}
