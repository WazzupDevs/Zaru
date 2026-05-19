import { type ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BookingDispatchService } from "./booking-dispatch.service";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { Env } from "../../../../config/env";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type { DriverDispatchCooldownRepositoryPort } from "../../application/ports/driver-dispatch-cooldown.repository.port";
import type { DriverOfferRepositoryPort } from "../../application/ports/driver-offer.repository.port";
import type { DriverSearchRepositoryPort } from "../../application/ports/driver-search.repository.port";
import type { CreateDriverOfferUseCase } from "../../application/use-cases/create-driver-offer.use-case";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";
import type { DispatchPolicyService } from "../../domain/services/dispatch-policy.service";
import type { DriverCandidate, DriverMatcher } from "../../domain/services/driver-matcher.service";
import type { MatchingPolicy } from "../../domain/value-objects/matching-policy";

const NOW = new Date("2026-08-15T10:00:00.000Z");

const config = {
  get: (key: string) => {
    const m: Record<string, unknown> = {
      DISPATCH_MAX_ATTEMPTS: 3,
      DISPATCH_RETRY_COOLDOWN_MS: 60_000,
      DISPATCH_LOCATION_FRESHNESS_SECONDS: 300,
    };
    return m[key];
  },
} as unknown as ConfigService<Env, true>;

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildBooking(id: string, overrides: Partial<BookingEntity> = {}): BookingEntity {
  return {
    id,
    customerId: "cust",
    priceQuoteId: "quote",
    status: "CONFIRMED",
    vehicleTypeId: "vt",
    categoryId: "cat",
    pickupLat: "41" as never,
    pickupLng: "28" as never,
    pickupAddress: "",
    dropoffLat: "41" as never,
    dropoffLng: "29" as never,
    dropoffAddress: "",
    eventStartAt: NOW,
    eventEndAt: NOW,
    totalAmount: "1000" as never,
    currency: "TRY",
    confirmedAt: NOW,
    driverAssignedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    expiredAt: null,
    cancellationReason: null,
    cancelledByUserId: null,
    driverId: null,
    vehicleId: null,
    dispatchAttempts: 0,
    lastDispatchAt: null,
    dispatchFailedReason: null,
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildOffer(overrides: Partial<DriverOfferEntity> & { id: string }): DriverOfferEntity {
  return {
    bookingId: "b-1",
    driverProfileId: "d-1",
    vehicleId: "v-1",
    status: "PENDING",
    expiresAt: new Date(NOW.getTime() - 1000),
    acceptedAt: null,
    rejectedAt: null,
    expiredAt: null,
    onTheWayAt: null,
    arrivedAt: null,
    inProgressAt: null,
    completedAt: null,
    cancelledAt: null,
    rejectReason: null,
    rejectNote: null,
    matchedDistanceKm: null,
    matchedScore: null,
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildCandidate(driverProfileId: string): DriverCandidate {
  return {
    driverProfileId,
    userId: `u-${driverProfileId}`,
    vehicleId: `v-${driverProfileId}`,
    vehicleTypeId: "vt",
    distanceKm: 1.5,
    ratingAverage: 4.8,
    ratingCount: 12,
  };
}

interface Harness {
  svc: BookingDispatchService;
  bookingRepo: BookingRepositoryPort;
  offerRepo: DriverOfferRepositoryPort;
  cooldownRepo: DriverDispatchCooldownRepositoryPort;
  searchRepo: DriverSearchRepositoryPort;
  outbox: OutboxWriterPort;
  matcher: DriverMatcher;
  createOfferUseCase: CreateDriverOfferUseCase;
}

function buildHarness(
  opts: {
    bookings?: BookingEntity[];
    expiredOffers?: DriverOfferEntity[];
    activeOfferByBookingId?: Map<string, DriverOfferEntity>;
    priorDriverIdsByBookingId?: Map<string, string[]>;
    candidates?: DriverCandidate[];
    matchResult?: { candidate: DriverCandidate; score: number } | null;
    cooldownDeleteCount?: number;
  } = {},
): Harness {
  const bookings = opts.bookings ?? [];
  const expiredOffers = opts.expiredOffers ?? [];
  const activeMap: Map<string, DriverOfferEntity> = opts.activeOfferByBookingId ?? new Map();
  const priorMap: Map<string, string[]> = opts.priorDriverIdsByBookingId ?? new Map();

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    findDispatchable: vi.fn(async () => bookings),
    recordDispatchFailure: vi.fn(async () => true),
    assignDriver: vi.fn(),
    reassignDriver: vi.fn(),
  };

  const offerRepo: DriverOfferRepositoryPort = {
    findById: vi.fn(),
    create: vi.fn(),
    transitionStatus: vi.fn(async (_tx, input) => ({
      ...buildOffer({ id: input.offerId }),
      status: input.toStatus,
      version: 1,
    })),
    findActiveByDriverId: vi.fn(),
    findActiveByBookingId: vi.fn(async (_tx, bookingId: string) => {
      const found: DriverOfferEntity | undefined = activeMap.get(bookingId);
      return found ?? null;
    }),
    findPriorDriverIdsForBooking: vi.fn(async (_tx, bookingId: string) => {
      const found: string[] | undefined = priorMap.get(bookingId);
      return found ?? [];
    }),
    findExpiredPending: vi.fn(async () => expiredOffers),
    list: vi.fn(),
  };

  const cooldownRepo: DriverDispatchCooldownRepositoryPort = {
    upsert: vi.fn(),
    findActive: vi.fn(),
    deleteExpired: vi.fn(async () => opts.cooldownDeleteCount ?? 0),
  };

  const searchRepo: DriverSearchRepositoryPort = {
    findCandidates: vi.fn(async () => opts.candidates ?? []),
  };

  const matcher = {
    pickBestMatch: vi.fn(() => opts.matchResult ?? null),
  } as unknown as DriverMatcher;

  const policy: MatchingPolicy = {
    maxRadiusKm: 50,
    distanceWeight: 0.7,
    ratingWeight: 0.3,
    minRating: 3.5,
  };
  const policyService = {
    getPolicy: () => policy,
  } as unknown as DispatchPolicyService;

  const createOfferUseCase = {
    execute: vi.fn(async () => buildOffer({ id: "new-offer" })),
  } as unknown as CreateDriverOfferUseCase;

  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const svc = new BookingDispatchService(
    bookingRepo,
    offerRepo,
    cooldownRepo,
    searchRepo,
    new FakeTxRunner(),
    outbox,
    new FrozenClock(NOW),
    matcher,
    policyService,
    createOfferUseCase,
    logger as never,
    config,
  );

  return {
    svc,
    bookingRepo,
    offerRepo,
    cooldownRepo,
    searchRepo,
    outbox,
    matcher,
    createOfferUseCase,
  };
}

describe("BookingDispatchService.sweep — phase A (auto-expire)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero counters when there is nothing to do", async () => {
    const h = buildHarness();
    const stats = await h.svc.sweep();
    expect(stats).toEqual({
      expired: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      cooldownsCleared: 0,
    });
  });

  it("transitions every expired PENDING offer to EXPIRED + emits one event each", async () => {
    const o1 = buildOffer({ id: "o-1", bookingId: "b-1", driverProfileId: "d-1" });
    const o2 = buildOffer({ id: "o-2", bookingId: "b-2", driverProfileId: "d-2" });
    const h = buildHarness({ expiredOffers: [o1, o2] });

    const stats = await h.svc.sweep();

    expect(stats.expired).toBe(2);
    expect(h.offerRepo.transitionStatus).toHaveBeenCalledTimes(2);
    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "dispatch.DriverOfferExpired",
        aggregateId: "b-1",
      }),
    );
    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "dispatch.DriverOfferExpired",
        aggregateId: "b-2",
      }),
    );
  });

  it("auto-expire isolates per-offer failures — one transition exception does not stop the loop", async () => {
    const o1 = buildOffer({ id: "o-1" });
    const o2 = buildOffer({ id: "o-2" });
    const h = buildHarness({ expiredOffers: [o1, o2] });
    (h.offerRepo.transitionStatus as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ...o2, status: "EXPIRED" });

    const stats = await h.svc.sweep();

    expect(stats.expired).toBe(1);
  });

  it("skips an offer when the transition race is lost (returns null)", async () => {
    const o1 = buildOffer({ id: "o-1" });
    const h = buildHarness({ expiredOffers: [o1] });
    (h.offerRepo.transitionStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const stats = await h.svc.sweep();

    expect(stats.expired).toBe(0);
    expect(h.outbox.write).not.toHaveBeenCalled();
  });
});

describe("BookingDispatchService.sweep — phase B (dispatch)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls findDispatchable with the configured max/cooldown/now", async () => {
    const h = buildHarness();
    await h.svc.sweep();
    expect(h.bookingRepo.findDispatchable).toHaveBeenCalledOnce();
    const arg = vi.mocked(h.bookingRepo.findDispatchable).mock.calls[0]![1];
    expect(arg.maxAttempts).toBe(3);
    expect(arg.cooldownMs).toBe(60_000);
    expect(arg.now).toEqual(NOW);
  });

  it("skips bookings that already have an active offer (no matcher call)", async () => {
    const b = buildBooking("b-1");
    const activeOffer = buildOffer({ id: "o-active", bookingId: "b-1" });
    const h = buildHarness({
      bookings: [b],
      activeOfferByBookingId: new Map([["b-1", activeOffer]]),
    });

    const stats = await h.svc.sweep();

    expect(stats.attempted).toBe(1);
    expect(stats.succeeded).toBe(0);
    expect(stats.failed).toBe(1);
    expect(h.searchRepo.findCandidates).not.toHaveBeenCalled();
    expect(h.createOfferUseCase.execute).not.toHaveBeenCalled();
  });

  it("creates an offer when matcher returns a candidate", async () => {
    const b = buildBooking("b-1");
    const candidate = buildCandidate("d-1");
    const h = buildHarness({
      bookings: [b],
      candidates: [candidate],
      matchResult: { candidate, score: 0.9 },
    });

    const stats = await h.svc.sweep();

    expect(stats.attempted).toBe(1);
    expect(stats.succeeded).toBe(1);
    expect(h.createOfferUseCase.execute).toHaveBeenCalledWith({
      bookingId: "b-1",
      driverProfileId: "d-1",
      vehicleId: "v-d-1",
      score: 0.9,
      distanceKm: 1.5,
    });
  });

  it("excludes prior offer recipients from the candidate query (no re-offer to the same driver)", async () => {
    const b = buildBooking("b-1");
    const h = buildHarness({
      bookings: [b],
      priorDriverIdsByBookingId: new Map([["b-1", ["d-prior"]]]),
      candidates: [],
    });

    await h.svc.sweep();

    expect(h.searchRepo.findCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ excludeDriverIds: ["d-prior"] }),
    );
  });

  it("records DispatchFailed when matcher returns no candidate (no_drivers_in_radius)", async () => {
    const b = buildBooking("b-1");
    const h = buildHarness({ bookings: [b], candidates: [], matchResult: null });

    const stats = await h.svc.sweep();

    expect(stats.failed).toBe(1);
    expect(stats.succeeded).toBe(0);
    expect(h.bookingRepo.recordDispatchFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "b-1",
        dispatchAttempts: 1,
        dispatchFailedReason: "no_drivers_in_radius",
      }),
    );
    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "dispatch.DispatchFailed",
        payload: expect.objectContaining({ reason: "no_drivers_in_radius" }),
      }),
    );
  });

  it("records DispatchFailed reason no_eligible_drivers when candidates exist but matcher rejects them", async () => {
    const b = buildBooking("b-1");
    const cand = buildCandidate("d-1");
    const h = buildHarness({ bookings: [b], candidates: [cand], matchResult: null });

    await h.svc.sweep();

    expect(h.bookingRepo.recordDispatchFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dispatchFailedReason: "no_eligible_drivers" }),
    );
  });

  it("flags requiresManualReview once attempts hits maxAttempts", async () => {
    const b = buildBooking("b-1", { dispatchAttempts: 2 });
    const h = buildHarness({ bookings: [b], candidates: [], matchResult: null });

    await h.svc.sweep();

    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ attempts: 3, requiresManualReview: true }),
      }),
    );
  });

  it("counts succeeded/failed correctly across a mixed batch", async () => {
    const b1 = buildBooking("b-1");
    const b2 = buildBooking("b-2");
    const b3 = buildBooking("b-3");
    const cand = buildCandidate("d-1");
    const cand3 = buildCandidate("d-3");
    const h = buildHarness({
      bookings: [b1, b2, b3],
      candidates: [cand],
      matchResult: { candidate: cand, score: 0.8 },
    });
    // b1 → match, b2 → no match, b3 → use case throws
    (h.matcher.pickBestMatch as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ candidate: cand, score: 0.8 })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ candidate: cand3, score: 0.7 });
    (h.createOfferUseCase.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(buildOffer({ id: "o-new" }))
      .mockRejectedValueOnce(new Error("boom"));

    const stats = await h.svc.sweep();

    expect(stats).toMatchObject({ attempted: 3, succeeded: 1, failed: 2 });
  });
});

describe("BookingDispatchService.sweep — phase C (cleanup)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes cooldown deleteExpired once and surfaces the count", async () => {
    const h = buildHarness({ cooldownDeleteCount: 7 });
    const stats = await h.svc.sweep();
    expect(h.cooldownRepo.deleteExpired).toHaveBeenCalledOnce();
    expect(stats.cooldownsCleared).toBe(7);
  });
});
