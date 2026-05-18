import { beforeEach, describe, expect, it, vi } from "vitest";

import { ListDriverOfferHistoryUseCase } from "./list-driver-offer-history.use-case";
import { DriverProfileNotFoundError } from "../../domain/errors/dispatch-errors";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type {
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";
import type {
  DriverOfferRepositoryPort,
  ListOffersForDriverInput,
} from "../ports/driver-offer.repository.port";

const DRIVER_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_USER_ID = "44444444-4444-4444-8444-444444444444";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildOffer(
  overrides: Partial<DriverOfferEntity> & { id: string; bookingId: string },
): DriverOfferEntity {
  return {
    driverProfileId: DRIVER_PROFILE_ID,
    vehicleId: "v-1",
    status: "COMPLETED",
    expiresAt: new Date("2026-08-15T10:05:00.000Z"),
    acceptedAt: new Date("2026-08-15T10:01:00.000Z"),
    rejectedAt: null,
    expiredAt: null,
    onTheWayAt: null,
    arrivedAt: null,
    inProgressAt: null,
    completedAt: new Date("2026-08-20T22:00:00.000Z"),
    cancelledAt: null,
    rejectReason: null,
    rejectNote: null,
    matchedDistanceKm: null,
    matchedScore: null,
    version: 5,
    createdAt: new Date("2026-08-15T10:00:00.000Z"),
    updatedAt: new Date("2026-08-20T22:00:00.000Z"),
    ...overrides,
  };
}

function buildBooking(overrides: Partial<BookingEntity> & { id: string }): BookingEntity {
  return {
    customerId: "c-1",
    priceQuoteId: "q-1",
    status: "COMPLETED",
    vehicleTypeId: "vt-1",
    categoryId: "cat-1",
    pickupLat: "41.0082000" as never,
    pickupLng: "28.9784000" as never,
    pickupAddress: "Sultanahmet",
    dropoffLat: "41.0428000" as never,
    dropoffLng: "29.0093000" as never,
    dropoffAddress: "Besiktas",
    eventStartAt: new Date("2026-08-20T14:00:00.000Z"),
    eventEndAt: new Date("2026-08-20T22:00:00.000Z"),
    totalAmount: "5000.00" as never,
    currency: "TRY",
    confirmedAt: new Date("2026-08-15T09:00:00.000Z"),
    driverAssignedAt: new Date("2026-08-15T10:01:00.000Z"),
    startedAt: new Date("2026-08-20T14:00:00.000Z"),
    completedAt: new Date("2026-08-20T22:00:00.000Z"),
    cancelledAt: null,
    expiredAt: null,
    cancellationReason: null,
    cancelledByUserId: null,
    driverId: DRIVER_PROFILE_ID,
    vehicleId: "v-1",
    dispatchAttempts: 1,
    lastDispatchAt: new Date("2026-08-15T10:00:00.000Z"),
    dispatchFailedReason: null,
    version: 3,
    createdAt: new Date("2026-08-15T09:00:00.000Z"),
    updatedAt: new Date("2026-08-20T22:00:00.000Z"),
    ...overrides,
  };
}

function driverProfile(overrides: Partial<DriverProfileRecord> = {}): DriverProfileRecord {
  return {
    id: DRIVER_PROFILE_ID,
    userId: DRIVER_USER_ID,
    firstName: "Mehmet",
    lastName: "Driver",
    nationalIdHash: "h",
    birthDate: new Date("1990-01-01"),
    ibanHash: "h",
    ibanLast4: "1234",
    status: "APPROVED",
    rejectionReason: null,
    approvedAt: new Date("2026-08-01"),
    approvedByUserId: "admin-1",
    commissionRate: "0.20",
    version: 0,
    createdAt: new Date("2026-08-01"),
    ...overrides,
  };
}

interface Harness {
  useCase: ListDriverOfferHistoryUseCase;
  offerRepo: DriverOfferRepositoryPort;
  bookingRepo: BookingRepositoryPort;
}

function buildHarness(
  opts: {
    offers?: DriverOfferEntity[];
    bookings?: BookingEntity[];
    driver?: DriverProfileRecord | null;
  } = {},
): Harness {
  const offers = opts.offers ?? [];
  const bookings = opts.bookings ?? [];

  const offerRepo: DriverOfferRepositoryPort = {
    findById: vi.fn(),
    create: vi.fn(),
    transitionStatus: vi.fn(),
    findActiveByDriverId: vi.fn(),
    findActiveByBookingId: vi.fn(),
    findPriorDriverIdsForBooking: vi.fn(),
    findExpiredPending: vi.fn(),
    list: vi.fn(async (_tx, input: ListOffersForDriverInput) => {
      if (input.driverProfileId !== DRIVER_PROFILE_ID) return [];
      const filtered = input.status
        ? offers.filter((o) => input.status!.includes(o.status))
        : offers;
      return filtered.slice(0, input.limit);
    }),
  };

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async (_tx, id) => bookings.find((b) => b.id === id) ?? null),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    assignDriver: vi.fn(),
    recordDispatchFailure: vi.fn(),
    findDispatchable: vi.fn(),
    reassignDriver: vi.fn(),
  };

  const driverRepo: DriverProfileRepositoryPort = {
    create: vi.fn(),
    findActiveByUserId: vi.fn(async () =>
      opts.driver === null ? null : (opts.driver ?? driverProfile()),
    ),
    findActiveById: vi.fn(),
    findByNationalIdHash: vi.fn(),
    updateBasics: vi.fn(),
    setStatus: vi.fn(),
    listPending: vi.fn(),
    updateLocation: vi.fn(),
    setOnline: vi.fn(),
  };

  const useCase = new ListDriverOfferHistoryUseCase(
    offerRepo,
    driverRepo,
    bookingRepo,
    new FakeTxRunner(),
  );

  return { useCase, offerRepo, bookingRepo };
}

describe("ListDriverOfferHistoryUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list when the driver has no offers", async () => {
    const h = buildHarness({ offers: [] });

    const result = await h.useCase.execute({ driverUserId: DRIVER_USER_ID });

    expect(result).toEqual([]);
    // Even with no offers, the driver lookup still happens.
    expect(h.bookingRepo.findById).not.toHaveBeenCalled();
  });

  it("enriches each offer with booking details + earnings", async () => {
    const offer1 = buildOffer({ id: "o-1", bookingId: "b-1" });
    const offer2 = buildOffer({
      id: "o-2",
      bookingId: "b-2",
      status: "REJECTED",
      rejectedAt: new Date("2026-08-19T10:00:00.000Z"),
      completedAt: null,
    });
    const booking1 = buildBooking({ id: "b-1", totalAmount: "5000.00" as never });
    const booking2 = buildBooking({ id: "b-2", totalAmount: "3000.00" as never });

    const h = buildHarness({
      offers: [offer1, offer2],
      bookings: [booking1, booking2],
    });

    const result = await h.useCase.execute({ driverUserId: DRIVER_USER_ID });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      offerId: "o-1",
      bookingId: "b-1",
      status: "COMPLETED",
      pickupAddress: "Sultanahmet",
      driverEarnings: { amount: "4000.00", currency: "TRY" },
    });
    expect(result[1]).toMatchObject({
      offerId: "o-2",
      bookingId: "b-2",
      status: "REJECTED",
      driverEarnings: { amount: "2400.00", currency: "TRY" },
    });
  });

  it("filters by status when supplied", async () => {
    const o1 = buildOffer({ id: "o-1", bookingId: "b-1", status: "COMPLETED" });
    const o2 = buildOffer({ id: "o-2", bookingId: "b-2", status: "CANCELLED" });
    const o3 = buildOffer({ id: "o-3", bookingId: "b-3", status: "REJECTED" });
    const b1 = buildBooking({ id: "b-1" });
    const b2 = buildBooking({ id: "b-2" });
    const b3 = buildBooking({ id: "b-3" });

    const h = buildHarness({ offers: [o1, o2, o3], bookings: [b1, b2, b3] });

    const result = await h.useCase.execute({
      driverUserId: DRIVER_USER_ID,
      status: ["COMPLETED", "CANCELLED"],
    });

    expect(result).toHaveLength(2);
    expect(result.map((o) => o.offerId)).toEqual(["o-1", "o-2"]);
  });

  it("uses default limit 20 when none supplied", async () => {
    const offers = Array.from({ length: 30 }, (_, i) =>
      buildOffer({ id: `o-${String(i)}`, bookingId: `b-${String(i)}` }),
    );
    const bookings = offers.map((o) => buildBooking({ id: o.bookingId }));

    const h = buildHarness({ offers, bookings });

    const result = await h.useCase.execute({ driverUserId: DRIVER_USER_ID });

    expect(result).toHaveLength(20);
  });

  it("respects an explicit limit", async () => {
    const offers = Array.from({ length: 10 }, (_, i) =>
      buildOffer({ id: `o-${String(i)}`, bookingId: `b-${String(i)}` }),
    );
    const bookings = offers.map((o) => buildBooking({ id: o.bookingId }));

    const h = buildHarness({ offers, bookings });

    const result = await h.useCase.execute({
      driverUserId: DRIVER_USER_ID,
      limit: 5,
    });

    expect(result).toHaveLength(5);
  });

  it("throws DriverProfileNotFoundError when the user has no driver profile", async () => {
    const h = buildHarness({ driver: null });

    await expect(h.useCase.execute({ driverUserId: DRIVER_USER_ID })).rejects.toBeInstanceOf(
      DriverProfileNotFoundError,
    );
  });

  it("falls back to empty pickup + zero earnings when the booking is missing", async () => {
    const o1 = buildOffer({ id: "o-1", bookingId: "b-missing" });
    const h = buildHarness({ offers: [o1], bookings: [] });

    const result = await h.useCase.execute({ driverUserId: DRIVER_USER_ID });

    expect(result[0]).toMatchObject({
      offerId: "o-1",
      pickupAddress: "",
      eventStartAt: null,
      driverEarnings: { amount: "0.00", currency: "TRY" },
    });
  });

  it("deduplicates bookings fetched for multiple offers with the same bookingId", async () => {
    // Defensive: should never happen because of (booking_id, driver_profile_id)
    // unique, but the dedup logic must be a single fetch per bookingId.
    const o1 = buildOffer({ id: "o-1", bookingId: "b-shared" });
    const o2 = buildOffer({ id: "o-2", bookingId: "b-shared" });
    const b = buildBooking({ id: "b-shared" });
    const h = buildHarness({ offers: [o1, o2], bookings: [b] });

    await h.useCase.execute({ driverUserId: DRIVER_USER_ID });

    expect((h.bookingRepo.findById as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
