import { describe, expect, it, beforeEach, vi } from "vitest";

import { ConfirmBookingUseCase } from "./confirm-booking.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import {
  QuoteAlreadyConsumedError,
  QuoteExpiredError,
  QuoteNotFoundError,
} from "../../../pricing/domain/errors/pricing-errors";
import { BookingAccessDeniedError } from "../../domain/errors/booking-errors";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type {
  PriceQuoteEntity,
  PriceQuoteRepositoryPort,
} from "../../../pricing/application/ports/price-quote.repository.port";
import type { BookingEntity } from "../../domain/booking-types";
import type { BookingRepositoryPort } from "../../domain/ports/booking.repository.port";

const NOW = new Date("2026-08-01T10:00:00.000Z");
const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "22222222-2222-4222-8222-222222222222";
const VEHICLE_TYPE_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

function buildQuote(overrides: Partial<PriceQuoteEntity> = {}): PriceQuoteEntity {
  return {
    id: QUOTE_ID,
    requestedByUserId: ACTOR_USER_ID,
    vehicleTypeId: VEHICLE_TYPE_ID,
    categoryId: CATEGORY_ID,
    pickupLat: "41.0082000",
    pickupLng: "28.9784000",
    pickupAddress: "Sultanahmet, Istanbul",
    dropoffLat: "41.0428000",
    dropoffLng: "29.0093000",
    dropoffAddress: "Besiktas, Istanbul",
    distanceKm: "5.20",
    durationMinutes: 18,
    eventStartAt: new Date("2026-08-15T14:00:00.000Z"),
    eventEndAt: new Date("2026-08-15T22:00:00.000Z"),
    durationHours: "8.00",
    breakdown: {
      baseFee: { amount: "3000.00", currency: "TRY" },
      distanceFee: { amount: "0.00", currency: "TRY" },
      hourlyFee: { amount: "1600.00", currency: "TRY" },
      subtotal: { amount: "4600.00", currency: "TRY" },
      multipliers: [],
      addons: [],
      totalAmount: { amount: "6877.00", currency: "TRY" },
    },
    totalAmount: "6877.00",
    currency: "TRY",
    selectedAddons: [],
    status: "ACTIVE",
    expiresAt: new Date(NOW.getTime() + 10 * 60_000),
    consumedAt: null,
    consumedByBookingId: null,
    createdAt: NOW,
    ...overrides,
  };
}

function buildHarness() {
  let storedQuote = buildQuote();
  let storedBooking: BookingEntity | null = null;

  const quoteRepo: PriceQuoteRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async (_tx, id) => (id === storedQuote.id ? storedQuote : null)),
    consumeQuote: vi.fn(async (_tx, id, bookingId, now) => {
      if (id !== storedQuote.id) throw new QuoteNotFoundError();
      if (storedQuote.status === "CONSUMED") throw new QuoteAlreadyConsumedError();
      if (storedQuote.expiresAt.getTime() <= now.getTime()) throw new QuoteExpiredError();
      storedQuote = {
        ...storedQuote,
        status: "CONSUMED",
        consumedAt: now,
        consumedByBookingId: bookingId,
      };
      return storedQuote;
    }),
  };

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(async (_tx, input) => {
      const entity: BookingEntity = {
        id: input.id ?? "booking-id-stub",
        customerId: input.customerId,
        priceQuoteId: input.priceQuoteId,
        status: input.status,
        vehicleTypeId: input.vehicleTypeId,
        categoryId: input.categoryId,
        pickupLat: input.pickupLat as never,
        pickupLng: input.pickupLng as never,
        pickupAddress: input.pickupAddress,
        dropoffLat: input.dropoffLat as never,
        dropoffLng: input.dropoffLng as never,
        dropoffAddress: input.dropoffAddress,
        eventStartAt: input.eventStartAt,
        eventEndAt: input.eventEndAt,
        totalAmount: input.totalAmount as never,
        currency: input.currency,
        confirmedAt: input.confirmedAt ?? null,
        driverAssignedAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        expiredAt: null,
        cancellationReason: null,
        cancelledByUserId: null,
        driverId: null,
        vehicleId: null,
        version: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      storedBooking = entity;
      return entity;
    }),
    findById: vi.fn(async () => storedBooking),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
  };

  class FakeTxRunner implements TxRunnerPort {
    async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
      return fn({} as TxClient);
    }
  }
  const txRunner = new FakeTxRunner();

  const outbox: OutboxWriterPort = {
    write: vi.fn(async () => undefined),
  };

  const clock = new FrozenClock(NOW);

  const useCase = new ConfirmBookingUseCase(bookingRepo, quoteRepo, txRunner, outbox, clock);

  return {
    useCase,
    quoteRepo,
    bookingRepo,
    txRunner,
    outbox,
    clock,
    setQuote: (q: PriceQuoteEntity) => {
      storedQuote = q;
    },
    getQuote: () => storedQuote,
  };
}

describe("ConfirmBookingUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: consumes quote, creates CONFIRMED booking with snapshot, emits two events", async () => {
    const h = buildHarness();
    const booking = await h.useCase.execute({ quoteId: QUOTE_ID }, { userId: ACTOR_USER_ID });

    expect(booking.status).toBe("CONFIRMED");
    expect(booking.priceQuoteId).toBe(QUOTE_ID);
    expect(booking.customerId).toBe(ACTOR_USER_ID);
    expect(booking.vehicleTypeId).toBe(VEHICLE_TYPE_ID);
    expect(booking.totalAmount).toBe("6877.00");
    expect(booking.currency).toBe("TRY");
    expect(booking.confirmedAt).toEqual(NOW);

    expect(h.quoteRepo.consumeQuote).toHaveBeenCalledOnce();
    expect(h.getQuote().status).toBe("CONSUMED");
    expect(h.getQuote().consumedByBookingId).toBe(booking.id);

    expect(h.bookingRepo.create).toHaveBeenCalledOnce();
    expect(h.outbox.write).toHaveBeenCalledTimes(2);

    const evtTypes = vi.mocked(h.outbox.write).mock.calls.map((c) => c[1].eventType);
    expect(evtTypes).toEqual(["booking.BookingCreated", "booking.BookingConfirmed"]);
  });

  it("outbox payloads carry NO location PII (no lat/lng/address)", async () => {
    const h = buildHarness();
    await h.useCase.execute({ quoteId: QUOTE_ID }, { userId: ACTOR_USER_ID });

    for (const call of vi.mocked(h.outbox.write).mock.calls) {
      const payload = call[1].payload as Record<string, unknown>;
      const stringified = JSON.stringify(payload);
      expect(stringified).not.toContain("Sultanahmet");
      expect(stringified).not.toContain("Besiktas");
      expect(stringified).not.toContain("41.0082");
      expect(stringified).not.toContain("28.9784");
      expect(payload).not.toHaveProperty("pickupAddress");
      expect(payload).not.toHaveProperty("pickupLat");
      expect(payload).not.toHaveProperty("dropoffLng");
    }
  });

  it("rejects when quote was requested by a different user", async () => {
    const h = buildHarness();
    h.setQuote(buildQuote({ requestedByUserId: "other-user-id" }));
    await expect(
      h.useCase.execute({ quoteId: QUOTE_ID }, { userId: ACTOR_USER_ID }),
    ).rejects.toBeInstanceOf(BookingAccessDeniedError);

    expect(h.quoteRepo.consumeQuote).not.toHaveBeenCalled();
    expect(h.bookingRepo.create).not.toHaveBeenCalled();
    expect(h.outbox.write).not.toHaveBeenCalled();
  });

  it("propagates QuoteNotFoundError when quote does not exist", async () => {
    const h = buildHarness();
    await expect(
      h.useCase.execute(
        { quoteId: "00000000-0000-4000-8000-000000000000" },
        { userId: ACTOR_USER_ID },
      ),
    ).rejects.toBeInstanceOf(QuoteNotFoundError);
  });

  it("propagates QuoteExpiredError when expiresAt has passed", async () => {
    const h = buildHarness();
    h.setQuote(buildQuote({ expiresAt: new Date(NOW.getTime() - 1000) }));
    await expect(
      h.useCase.execute({ quoteId: QUOTE_ID }, { userId: ACTOR_USER_ID }),
    ).rejects.toBeInstanceOf(QuoteExpiredError);
    expect(h.bookingRepo.create).not.toHaveBeenCalled();
  });

  it("propagates QuoteAlreadyConsumedError on second confirm", async () => {
    const h = buildHarness();
    await h.useCase.execute({ quoteId: QUOTE_ID }, { userId: ACTOR_USER_ID });
    await expect(
      h.useCase.execute({ quoteId: QUOTE_ID }, { userId: ACTOR_USER_ID }),
    ).rejects.toBeInstanceOf(QuoteAlreadyConsumedError);
  });

  it("BookingCreated payload carries totalAmount + currency + event window", async () => {
    const h = buildHarness();
    const booking = await h.useCase.execute({ quoteId: QUOTE_ID }, { userId: ACTOR_USER_ID });

    const createdEvt = vi
      .mocked(h.outbox.write)
      .mock.calls.find((c) => c[1].eventType === "booking.BookingCreated");
    expect(createdEvt).toBeDefined();
    const payload = createdEvt![1].payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      bookingId: booking.id,
      customerId: ACTOR_USER_ID,
      vehicleTypeId: VEHICLE_TYPE_ID,
      categoryId: CATEGORY_ID,
      totalAmount: "6877.00",
      currency: "TRY",
      eventStartAt: "2026-08-15T14:00:00.000Z",
      eventEndAt: "2026-08-15T22:00:00.000Z",
    });
  });
});
