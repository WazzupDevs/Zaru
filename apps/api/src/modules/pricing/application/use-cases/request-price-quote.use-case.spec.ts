import { type ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { RequestPriceQuoteUseCase } from "./request-price-quote.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { InMemoryRateLimiter } from "../../../../../test/fakes/in-memory-rate-limiter";
import {
  InvalidAddonSelectionError,
  InvalidTimeRangeError,
  PricingProfileNotFoundError,
} from "../../domain/errors/pricing-errors";
import { PricingCalculator } from "../../domain/services/pricing-calculator.service";
import { RuleEvaluator } from "../../domain/services/rule-evaluator.service";

import type {
  OutboxEventInput,
  OutboxWriterPort,
} from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { Env } from "../../../../config/env";
import type { PricingProfileEntity, PricingRuleEntity } from "../../domain/entities/pricing-types";
import type {
  DistanceCalculationResult,
  DistanceCalculatorPort,
} from "../ports/distance-calculator.port";
import type {
  CreatePriceQuoteInput,
  PriceQuoteEntity,
  PriceQuoteRepositoryPort,
} from "../ports/price-quote.repository.port";
import type { PricingProfileRepositoryPort } from "../ports/pricing-profile.repository.port";
import type { PricingRuleRepositoryPort } from "../ports/pricing-rule.repository.port";

const NOW = new Date("2026-08-01T08:00:00.000Z"); // Saturday in summer
const FUTURE_START = new Date("2026-08-15T14:00:00.000Z"); // Saturday
const FUTURE_END = new Date("2026-08-15T22:00:00.000Z"); // 8 hours
const VEHICLE_TYPE_ID = "vt-classic-sedan";
const CATEGORY_ID = "cat-wedding-car";
const USER_ID = "u-1";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

class FakeDistance implements DistanceCalculatorPort {
  result: DistanceCalculationResult = { distanceKm: 50, durationMinutes: 60 };
  failWith?: Error;
  async calculate(): Promise<DistanceCalculationResult> {
    if (this.failWith) throw this.failWith;
    return this.result;
  }
}

class FakeProfileRepo implements PricingProfileRepositoryPort {
  profile: PricingProfileEntity | null = {
    id: "p-1",
    vehicleTypeId: VEHICLE_TYPE_ID,
    currency: "TRY",
    baseFee: "3000.00",
    perKmFee: "15.00",
    perHourFee: "200.00",
    minimumHours: 4,
    includedKm: 50,
    isActive: true,
  };
  async findActiveByVehicleType(): Promise<PricingProfileEntity | null> {
    return this.profile;
  }
  async list(): Promise<PricingProfileEntity[]> {
    return this.profile ? [this.profile] : [];
  }
  async upsert(): Promise<PricingProfileEntity> {
    throw new Error("not in scope");
  }
}

class FakeRuleRepo implements PricingRuleRepositoryPort {
  rules: PricingRuleEntity[] = [];
  async findActive(): Promise<PricingRuleEntity[]> {
    return this.rules;
  }
  async findById(): Promise<PricingRuleEntity | null> {
    return null;
  }
  async list(): Promise<PricingRuleEntity[]> {
    return this.rules;
  }
  async create(): Promise<PricingRuleEntity> {
    throw new Error("not in scope");
  }
  async deactivate(): Promise<PricingRuleEntity> {
    throw new Error("not in scope");
  }
}

class FakeQuoteRepo implements PriceQuoteRepositoryPort {
  created: CreatePriceQuoteInput[] = [];
  async create(_tx: TxClient, input: CreatePriceQuoteInput): Promise<PriceQuoteEntity> {
    this.created.push(input);
    return {
      id: `q-${this.created.length.toString()}`,
      ...input,
      consumedAt: null,
      consumedByBookingId: null,
      status: "ACTIVE",
      createdAt: NOW,
    };
  }
  async findById(): Promise<PriceQuoteEntity | null> {
    return null;
  }
  async consumeQuote(): Promise<PriceQuoteEntity> {
    throw new Error("not in scope");
  }
  async expireOlderThan(): Promise<PriceQuoteEntity[]> {
    return [];
  }
}

interface CapturedOutbox {
  events: OutboxEventInput[];
}
function buildOutbox(captured: CapturedOutbox): OutboxWriterPort {
  return {
    write(_tx: TxClient, event: OutboxEventInput) {
      captured.events.push(event);
      return Promise.resolve();
    },
  };
}

const config = {
  get: (key: string) => (key === "PRICE_QUOTE_TTL_SECONDS" ? 900 : undefined),
} as unknown as ConfigService<Env, true>;

function buildUseCase(): {
  uc: RequestPriceQuoteUseCase;
  profileRepo: FakeProfileRepo;
  ruleRepo: FakeRuleRepo;
  quoteRepo: FakeQuoteRepo;
  distance: FakeDistance;
  outbox: CapturedOutbox;
} {
  const profileRepo = new FakeProfileRepo();
  const ruleRepo = new FakeRuleRepo();
  const quoteRepo = new FakeQuoteRepo();
  const distance = new FakeDistance();
  const outbox: CapturedOutbox = { events: [] };
  const uc = new RequestPriceQuoteUseCase(
    profileRepo,
    ruleRepo,
    quoteRepo,
    distance,
    new FakeTxRunner(),
    buildOutbox(outbox),
    new FrozenClock(NOW),
    new InMemoryRateLimiter(() => NOW.getTime()),
    new PricingCalculator(),
    new RuleEvaluator(),
    config,
  );
  return { uc, profileRepo, ruleRepo, quoteRepo, distance, outbox };
}

describe("RequestPriceQuoteUseCase", () => {
  const baseInput = {
    vehicleTypeId: VEHICLE_TYPE_ID,
    categoryId: CATEGORY_ID,
    pickupLat: 41.0082,
    pickupLng: 28.9784,
    pickupAddress: "Sultanahmet",
    dropoffLat: 41.0428,
    dropoffLng: 29.0093,
    dropoffAddress: "Beşiktaş",
    eventStartAt: FUTURE_START,
    eventEndAt: FUTURE_END,
    selectedAddonIds: [] as string[],
  };

  it("happy path with summer + weekend multipliers compounds (1.30 × 1.15)", async () => {
    const { uc, ruleRepo, quoteRepo, outbox } = buildUseCase();
    ruleRepo.rules = [
      {
        id: "r-summer",
        type: "SEASONAL_MULTIPLIER",
        categoryId: null,
        vehicleTypeId: null,
        name: "Yaz Sezonu",
        description: null,
        validFrom: new Date("2026-05-01"),
        validTo: new Date("2026-09-30"),
        daysOfWeek: null,
        multiplier: "1.30",
        fixedAmount: null,
        isOptional: false,
        sortOrder: 0,
        isActive: true,
      },
      {
        id: "r-weekend",
        type: "DAY_OF_WEEK_MULTIPLIER",
        categoryId: null,
        vehicleTypeId: null,
        name: "Hafta Sonu",
        description: null,
        validFrom: null,
        validTo: null,
        daysOfWeek: 96,
        multiplier: "1.15",
        fixedAmount: null,
        isOptional: false,
        sortOrder: 1,
        isActive: true,
      },
    ];

    const result = await uc.execute(baseInput, { userId: USER_ID });

    // base 3000 + dist 0 (50 km included) + hourly 8×200 = 1600 → subtotal 4600
    // × 1.30 = 5980; × 1.15 = 6877.00
    expect(result.totalAmount).toBe("6877.00");
    expect(result.status).toBe("ACTIVE");
    expect(quoteRepo.created).toHaveLength(1);
    expect(quoteRepo.created[0]?.expiresAt.getTime()).toBe(NOW.getTime() + 900_000);

    // Outbox event must NOT contain location PII.
    expect(outbox.events).toHaveLength(1);
    const payloadJson = JSON.stringify(outbox.events[0]?.payload);
    expect(payloadJson).not.toContain("Sultanahmet");
    expect(payloadJson).not.toContain("Beşiktaş");
    expect(payloadJson).not.toContain("41.0082");
  });

  it("bills only kilometers above includedKm (80 km → 30 × 15 = 450)", async () => {
    const { uc, distance } = buildUseCase();
    distance.result = { distanceKm: 80, durationMinutes: 90 };
    const result = await uc.execute(baseInput, { userId: USER_ID });
    // base 3000 + 30×15=450 + 8×200=1600 = 5050
    expect(result.totalAmount).toBe("5050.00");
  });

  it("rejects past eventStartAt", async () => {
    const { uc } = buildUseCase();
    await expect(
      uc.execute(
        { ...baseInput, eventStartAt: new Date("2026-07-01T00:00:00Z") },
        { userId: USER_ID },
      ),
    ).rejects.toBeInstanceOf(InvalidTimeRangeError);
  });

  it("rejects when eventEndAt <= eventStartAt", async () => {
    const { uc } = buildUseCase();
    await expect(
      uc.execute({ ...baseInput, eventEndAt: FUTURE_START }, { userId: USER_ID }),
    ).rejects.toBeInstanceOf(InvalidTimeRangeError);
  });

  it("throws PricingProfileNotFoundError when vehicleType has no active profile", async () => {
    const { uc, profileRepo } = buildUseCase();
    profileRepo.profile = null;
    await expect(uc.execute(baseInput, { userId: USER_ID })).rejects.toBeInstanceOf(
      PricingProfileNotFoundError,
    );
  });

  it("propagates DistanceCalculator failures (call lives outside the tx)", async () => {
    const { uc, distance, quoteRepo } = buildUseCase();
    distance.failWith = new Error("upstream timeout");
    await expect(uc.execute(baseInput, { userId: USER_ID })).rejects.toThrowError(/timeout/);
    expect(quoteRepo.created).toHaveLength(0);
  });

  it("rejects selected addon ids that are not in the applicable rule set", async () => {
    const { uc } = buildUseCase();
    await expect(
      uc.execute({ ...baseInput, selectedAddonIds: ["unknown-addon"] }, { userId: USER_ID }),
    ).rejects.toBeInstanceOf(InvalidAddonSelectionError);
  });
});
