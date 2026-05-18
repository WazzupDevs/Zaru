import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateDriverOfferStatusUseCase } from "./update-driver-offer-status.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import {
  ConcurrentDispatchError,
  ConcurrentOfferModificationError,
  OfferForbiddenError,
  OfferNotFoundError,
  OfferStateTransitionError,
} from "../../domain/errors/dispatch-errors";
import { DISPATCH_EVENT_TYPES } from "../../domain/events/dispatch-events";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity, BookingStatus } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type {
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import type { DriverOfferEntity, DriverOfferStatus } from "../../domain/driver-offer-types";
import type { DriverOfferRepositoryPort } from "../ports/driver-offer.repository.port";

const NOW = new Date("2026-08-20T15:00:00.000Z");
const OFFER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_USER_ID = "44444444-4444-4444-8444-444444444444";
const VEHICLE_ID = "55555555-5555-4555-8555-555555555555";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildOffer(overrides: Partial<DriverOfferEntity> = {}): DriverOfferEntity {
  return {
    id: OFFER_ID,
    bookingId: BOOKING_ID,
    driverProfileId: DRIVER_PROFILE_ID,
    vehicleId: VEHICLE_ID,
    status: "ACCEPTED",
    expiresAt: new Date("2026-08-15T10:05:00.000Z"),
    acceptedAt: new Date("2026-08-15T10:01:00.000Z"),
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
    version: 1,
    createdAt: new Date("2026-08-15T10:00:00.000Z"),
    updatedAt: new Date("2026-08-15T10:01:00.000Z"),
    ...overrides,
  };
}

function buildBooking(overrides: Partial<BookingEntity> = {}): BookingEntity {
  return {
    id: BOOKING_ID,
    customerId: "c-1",
    priceQuoteId: "q-1",
    status: "DRIVER_ASSIGNED",
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
    totalAmount: "6877.00" as never,
    currency: "TRY",
    confirmedAt: new Date("2026-08-15T09:00:00.000Z"),
    driverAssignedAt: new Date("2026-08-15T10:01:00.000Z"),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    expiredAt: null,
    cancellationReason: null,
    cancelledByUserId: null,
    driverId: DRIVER_PROFILE_ID,
    vehicleId: VEHICLE_ID,
    dispatchAttempts: 1,
    lastDispatchAt: new Date("2026-08-15T10:00:00.000Z"),
    dispatchFailedReason: null,
    version: 2,
    createdAt: new Date("2026-08-15T09:00:00.000Z"),
    updatedAt: new Date("2026-08-15T10:01:00.000Z"),
    ...overrides,
  };
}

function driverProfile(): DriverProfileRecord {
  return {
    id: DRIVER_PROFILE_ID,
    userId: DRIVER_USER_ID,
    firstName: "Test",
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
  };
}

interface Harness {
  useCase: UpdateDriverOfferStatusUseCase;
  offer: DriverOfferEntity;
  booking: BookingEntity;
  offerRepo: DriverOfferRepositoryPort;
  bookingRepo: BookingRepositoryPort;
  outbox: OutboxWriterPort;
}

function buildHarness(
  overrides: {
    offer?: Partial<DriverOfferEntity>;
    booking?: Partial<BookingEntity>;
    driver?: DriverProfileRecord | null;
  } = {},
): Harness {
  const offer = buildOffer(overrides.offer);
  const booking = buildBooking(overrides.booking);

  const offerRepo: DriverOfferRepositoryPort = {
    findById: vi.fn(async (_tx, id) => (id === offer.id ? offer : null)),
    create: vi.fn(),
    transitionStatus: vi.fn(async (_tx, input) => {
      if (input.fromVersion !== offer.version) return null;
      const next: DriverOfferEntity = {
        ...offer,
        status: input.toStatus,
        version: offer.version + 1,
        onTheWayAt: input.fields?.onTheWayAt ?? offer.onTheWayAt,
        arrivedAt: input.fields?.arrivedAt ?? offer.arrivedAt,
        inProgressAt: input.fields?.inProgressAt ?? offer.inProgressAt,
        completedAt: input.fields?.completedAt ?? offer.completedAt,
      };
      return next;
    }),
    findActiveByDriverId: vi.fn(),
    findActiveByBookingId: vi.fn(),
    findPriorDriverIdsForBooking: vi.fn(),
    findExpiredPending: vi.fn(),
    list: vi.fn(),
  };

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async (_tx, id) => (id === booking.id ? booking : null)),
    transitionStatus: vi.fn(async (_tx, input) => {
      if (input.fromVersion !== booking.version) return null;
      const next: BookingEntity = {
        ...booking,
        status: input.toStatus,
        version: booking.version + 1,
        startedAt: input.fields?.startedAt ?? booking.startedAt,
        completedAt: input.fields?.completedAt ?? booking.completedAt,
      };
      return next;
    }),
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
      overrides.driver === null ? null : (overrides.driver ?? driverProfile()),
    ),
    findActiveById: vi.fn(),
    findByNationalIdHash: vi.fn(),
    updateBasics: vi.fn(),
    setStatus: vi.fn(),
    listPending: vi.fn(),
    updateLocation: vi.fn(),
    setOnline: vi.fn(),
  };

  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };

  const useCase = new UpdateDriverOfferStatusUseCase(
    offerRepo,
    driverRepo,
    bookingRepo,
    new FakeTxRunner(),
    outbox,
    new FrozenClock(NOW),
  );

  return { useCase, offer, booking, offerRepo, bookingRepo, outbox };
}

describe("UpdateDriverOfferStatusUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ACCEPTED → ON_THE_WAY", () => {
    it("writes onTheWayAt + emits DriverOnTheWay; booking untouched", async () => {
      const h = buildHarness();

      const result = await h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "ON_THE_WAY",
      });

      expect(result.status).toBe("ON_THE_WAY");

      expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          offerId: OFFER_ID,
          fromVersion: 1,
          toStatus: "ON_THE_WAY",
          fields: expect.objectContaining({ onTheWayAt: NOW }),
        }),
      );
      expect(h.bookingRepo.transitionStatus).not.toHaveBeenCalled();
      expect(h.outbox.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: DISPATCH_EVENT_TYPES.DRIVER_ON_THE_WAY,
          aggregateType: "Booking",
          aggregateId: BOOKING_ID,
          payload: expect.objectContaining({
            offerId: OFFER_ID,
            bookingId: BOOKING_ID,
            driverProfileId: DRIVER_PROFILE_ID,
          }),
        }),
      );
    });
  });

  describe("ON_THE_WAY → ARRIVED", () => {
    it("writes arrivedAt + emits DriverArrived; booking untouched", async () => {
      const h = buildHarness({
        offer: { status: "ON_THE_WAY", onTheWayAt: new Date("2026-08-20T14:30:00.000Z") },
      });

      const result = await h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "ARRIVED",
      });

      expect(result.status).toBe("ARRIVED");

      expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          toStatus: "ARRIVED",
          fields: expect.objectContaining({ arrivedAt: NOW }),
        }),
      );
      expect(h.bookingRepo.transitionStatus).not.toHaveBeenCalled();
      expect(h.outbox.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: DISPATCH_EVENT_TYPES.DRIVER_ARRIVED }),
      );
    });
  });

  describe("ARRIVED → IN_PROGRESS", () => {
    it("transitions booking DRIVER_ASSIGNED → IN_PROGRESS + emits BookingInProgress", async () => {
      const h = buildHarness({
        offer: { status: "ARRIVED", arrivedAt: new Date("2026-08-20T14:45:00.000Z") },
      });

      const result = await h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "IN_PROGRESS",
      });

      expect(result.status).toBe("IN_PROGRESS");

      expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          toStatus: "IN_PROGRESS",
          fields: expect.objectContaining({ inProgressAt: NOW }),
        }),
      );
      expect(h.bookingRepo.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: BOOKING_ID,
          fromVersion: 2,
          toStatus: "IN_PROGRESS",
          fields: expect.objectContaining({ startedAt: NOW }),
        }),
      );
      expect(h.outbox.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: DISPATCH_EVENT_TYPES.BOOKING_IN_PROGRESS }),
      );
    });
  });

  describe("IN_PROGRESS → COMPLETED", () => {
    it("transitions booking IN_PROGRESS → COMPLETED + emits BookingCompleted", async () => {
      const h = buildHarness({
        offer: { status: "IN_PROGRESS", inProgressAt: new Date("2026-08-20T15:00:00.000Z") },
        booking: { status: "IN_PROGRESS", startedAt: new Date("2026-08-20T15:00:00.000Z") },
      });

      const result = await h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "COMPLETED",
      });

      expect(result.status).toBe("COMPLETED");

      expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          toStatus: "COMPLETED",
          fields: expect.objectContaining({ completedAt: NOW }),
        }),
      );
      expect(h.bookingRepo.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          toStatus: "COMPLETED",
          fields: expect.objectContaining({ completedAt: NOW }),
        }),
      );
      expect(h.outbox.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: DISPATCH_EVENT_TYPES.BOOKING_COMPLETED }),
      );
    });
  });

  it("idempotent same-state target: returns offer with no writes", async () => {
    const h = buildHarness({
      offer: { status: "ARRIVED", arrivedAt: new Date("2026-08-20T14:45:00.000Z") },
    });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
      targetStatus: "ARRIVED",
    });

    expect(result.status).toBe("ARRIVED");
    expect(h.offerRepo.transitionStatus).not.toHaveBeenCalled();
    expect(h.bookingRepo.transitionStatus).not.toHaveBeenCalled();
    expect(h.outbox.write).not.toHaveBeenCalled();
  });

  it("idempotent COMPLETED → COMPLETED short-circuits", async () => {
    const h = buildHarness({
      offer: { status: "COMPLETED", completedAt: new Date("2026-08-20T16:00:00.000Z") },
      booking: { status: "COMPLETED" },
    });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
      targetStatus: "COMPLETED",
    });

    expect(result.status).toBe("COMPLETED");
    expect(h.offerRepo.transitionStatus).not.toHaveBeenCalled();
    expect(h.bookingRepo.transitionStatus).not.toHaveBeenCalled();
  });

  it("throws OfferNotFoundError when offer id does not exist", async () => {
    const h = buildHarness();

    await expect(
      h.useCase.execute({
        offerId: "00000000-0000-4000-8000-000000000000",
        driverUserId: DRIVER_USER_ID,
        targetStatus: "ON_THE_WAY",
      }),
    ).rejects.toBeInstanceOf(OfferNotFoundError);
  });

  it("throws OfferForbiddenError when driver does not own the offer", async () => {
    const h = buildHarness({
      driver: { ...driverProfile(), id: "99999999-9999-4999-8999-999999999999" },
    });

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "ON_THE_WAY",
      }),
    ).rejects.toBeInstanceOf(OfferForbiddenError);
  });

  it.each([
    ["ARRIVED", "ON_THE_WAY"],
    ["IN_PROGRESS", "ARRIVED"],
    ["ON_THE_WAY", "ACCEPTED"],
  ] as const)("rejects backwards transition %s → %s", async (from, to) => {
    const h = buildHarness({ offer: { status: from } });

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: to as "ON_THE_WAY" | "ARRIVED" | "IN_PROGRESS" | "COMPLETED",
      }),
    ).rejects.toBeInstanceOf(OfferStateTransitionError);
  });

  it.each([
    ["ACCEPTED", "ARRIVED"],
    ["ACCEPTED", "IN_PROGRESS"],
    ["ACCEPTED", "COMPLETED"],
    ["ON_THE_WAY", "IN_PROGRESS"],
    ["ARRIVED", "COMPLETED"],
  ] as const)("rejects skip-step transition %s → %s", async (from, to) => {
    const h = buildHarness({ offer: { status: from } });

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: to,
      }),
    ).rejects.toBeInstanceOf(OfferStateTransitionError);
  });

  it("rejects PENDING → ON_THE_WAY (must accept first)", async () => {
    const h = buildHarness({ offer: { status: "PENDING" } });

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "ON_THE_WAY",
      }),
    ).rejects.toBeInstanceOf(OfferStateTransitionError);
  });

  it.each(["REJECTED", "EXPIRED", "CANCELLED"] as const satisfies DriverOfferStatus[])(
    "rejects any update from terminal failure state %s",
    async (status) => {
      const h = buildHarness({ offer: { status } });

      await expect(
        h.useCase.execute({
          offerId: OFFER_ID,
          driverUserId: DRIVER_USER_ID,
          targetStatus: "ON_THE_WAY",
        }),
      ).rejects.toBeInstanceOf(OfferStateTransitionError);
    },
  );

  it("throws ConcurrentOfferModificationError when offer version race is lost", async () => {
    const h = buildHarness();
    (h.offerRepo.transitionStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "ON_THE_WAY",
      }),
    ).rejects.toBeInstanceOf(ConcurrentOfferModificationError);
  });

  it("throws ConcurrentDispatchError when booking version race is lost on IN_PROGRESS transition", async () => {
    const h = buildHarness({
      offer: { status: "ARRIVED", arrivedAt: new Date("2026-08-20T14:45:00.000Z") },
    });
    (h.bookingRepo.transitionStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "IN_PROGRESS",
      }),
    ).rejects.toBeInstanceOf(ConcurrentDispatchError);
  });

  it("does not transition booking when offer goes ACCEPTED → ON_THE_WAY", async () => {
    const h = buildHarness();

    await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
      targetStatus: "ON_THE_WAY",
    });

    expect(h.bookingRepo.findById).not.toHaveBeenCalled();
    expect(h.bookingRepo.transitionStatus).not.toHaveBeenCalled();
  });

  it("requires the booking row to exist when transitioning to IN_PROGRESS", async () => {
    const h = buildHarness({
      offer: { status: "ARRIVED" },
    });
    (h.bookingRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        targetStatus: "IN_PROGRESS",
      }),
    ).rejects.toBeInstanceOf(ConcurrentDispatchError);
  });

  it.each(["DRAFT", "CONFIRMED", "CANCELLED_BY_CUSTOMER"] as const satisfies BookingStatus[])(
    "throws ConcurrentDispatchError when booking is in %s and offer wants IN_PROGRESS",
    async (bookingStatus) => {
      const h = buildHarness({
        offer: { status: "ARRIVED" },
        booking: { status: bookingStatus },
      });

      await expect(
        h.useCase.execute({
          offerId: OFFER_ID,
          driverUserId: DRIVER_USER_ID,
          targetStatus: "IN_PROGRESS",
        }),
      ).rejects.toBeInstanceOf(ConcurrentDispatchError);
    },
  );
});
