import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateDriverOfferUseCase } from "./create-driver-offer.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { BookingNotFoundError } from "../../../booking/domain/errors/booking-errors";
import {
  BookingNotDispatchableError,
  ConcurrentDispatchError,
  DriverHasActiveOfferError,
} from "../../domain/errors/dispatch-errors";
import { DISPATCH_EVENT_TYPES } from "../../domain/events/dispatch-events";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";
import type { DriverOfferRepositoryPort } from "../ports/driver-offer.repository.port";

const NOW = new Date("2026-08-15T10:00:00.000Z");
const FIVE_MIN_MS = 5 * 60 * 1000;
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const VEHICLE_ID = "33333333-3333-4333-8333-333333333333";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildBooking(overrides: Partial<BookingEntity> = {}): BookingEntity {
  return {
    id: BOOKING_ID,
    customerId: "c-1",
    priceQuoteId: "q-1",
    status: "CONFIRMED",
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
    createdAt: new Date("2026-08-15T09:00:00.000Z"),
    updatedAt: new Date("2026-08-15T09:00:00.000Z"),
    ...overrides,
  };
}

interface Harness {
  useCase: CreateDriverOfferUseCase;
  booking: BookingEntity;
  offerRepo: DriverOfferRepositoryPort;
  bookingRepo: BookingRepositoryPort;
  outbox: OutboxWriterPort;
}

function buildHarness(
  overrides: {
    booking?: Partial<BookingEntity> | null;
    activeOffersForDriver?: DriverOfferEntity[];
  } = {},
): Harness {
  const booking = overrides.booking === null ? null : buildBooking(overrides.booking ?? {});

  const createdOfferRef: { value: DriverOfferEntity | null } = { value: null };

  const offerRepo: DriverOfferRepositoryPort = {
    findById: vi.fn(),
    create: vi.fn(async (_tx, input) => {
      const offer: DriverOfferEntity = {
        id: "offer-1",
        bookingId: input.bookingId,
        driverProfileId: input.driverProfileId,
        vehicleId: input.vehicleId,
        status: "PENDING",
        expiresAt: input.expiresAt,
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
        matchedDistanceKm: input.matchedDistanceKm as never,
        matchedScore: input.matchedScore as never,
        version: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      createdOfferRef.value = offer;
      return offer;
    }),
    transitionStatus: vi.fn(),
    findActiveByDriverId: vi.fn(async () => overrides.activeOffersForDriver ?? []),
    findActiveByBookingId: vi.fn(),
    findPriorDriverIdsForBooking: vi.fn(),
    findExpiredPending: vi.fn(),
    list: vi.fn(),
  };

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async (_tx, id) => (booking && id === booking.id ? booking : null)),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    assignDriver: vi.fn(),
    recordDispatchFailure: vi.fn(async (_tx, input) => input.fromVersion === booking?.version),
    findDispatchable: vi.fn(),
    reassignDriver: vi.fn(),
  };

  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };

  const useCase = new CreateDriverOfferUseCase(
    offerRepo,
    bookingRepo,
    new FakeTxRunner(),
    outbox,
    new FrozenClock(NOW),
  );

  return {
    useCase,
    booking: booking!,
    offerRepo,
    bookingRepo,
    outbox,
  };
}

describe("CreateDriverOfferUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: CONFIRMED booking + eligible driver → PENDING offer + booking attempt counter ticks + DriverDispatched outbox", async () => {
    const h = buildHarness();

    const offer = await h.useCase.execute({
      bookingId: BOOKING_ID,
      driverProfileId: DRIVER_PROFILE_ID,
      vehicleId: VEHICLE_ID,
      score: 0.84,
      distanceKm: 2.3,
    });

    expect(offer).not.toBeNull();
    expect(offer.status).toBe("PENDING");
    expect(offer.expiresAt).toEqual(new Date(NOW.getTime() + FIVE_MIN_MS));

    expect(h.offerRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: BOOKING_ID,
        driverProfileId: DRIVER_PROFILE_ID,
        vehicleId: VEHICLE_ID,
        matchedDistanceKm: 2.3,
        matchedScore: 0.84,
        expiresAt: new Date(NOW.getTime() + FIVE_MIN_MS),
      }),
    );

    // Booking dispatchAttempts/lastDispatchAt bumped so the worker
    // honours the 60s cooldown before retrying the next candidate.
    expect(h.bookingRepo.recordDispatchFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: BOOKING_ID,
        fromVersion: 0,
        dispatchAttempts: 1,
        lastDispatchAt: NOW,
        dispatchFailedReason: null,
      }),
    );

    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: DISPATCH_EVENT_TYPES.DRIVER_DISPATCHED,
        aggregateType: "Booking",
        aggregateId: BOOKING_ID,
        payload: expect.objectContaining({
          bookingId: BOOKING_ID,
          driverProfileId: DRIVER_PROFILE_ID,
          vehicleId: VEHICLE_ID,
          distanceKm: 2.3,
          score: 0.84,
          attempts: 1,
          dispatchedAt: NOW.toISOString(),
        }),
      }),
    );
  });

  it("rejects when the booking does not exist", async () => {
    const h = buildHarness({ booking: null });

    await expect(
      h.useCase.execute({
        bookingId: BOOKING_ID,
        driverProfileId: DRIVER_PROFILE_ID,
        vehicleId: VEHICLE_ID,
        score: 0.5,
        distanceKm: 1,
      }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);

    expect(h.offerRepo.create).not.toHaveBeenCalled();
    expect(h.outbox.write).not.toHaveBeenCalled();
  });

  it.each([
    "DRIVER_ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED_BY_CUSTOMER",
    "EXPIRED",
  ] as const)("rejects when the booking is %s (must be CONFIRMED)", async (status) => {
    const h = buildHarness({ booking: { status } });

    await expect(
      h.useCase.execute({
        bookingId: BOOKING_ID,
        driverProfileId: DRIVER_PROFILE_ID,
        vehicleId: VEHICLE_ID,
        score: 0.5,
        distanceKm: 1,
      }),
    ).rejects.toBeInstanceOf(BookingNotDispatchableError);

    expect(h.offerRepo.create).not.toHaveBeenCalled();
  });

  it("throws DriverHasActiveOfferError when the candidate driver already owns an active offer", async () => {
    const otherActive: DriverOfferEntity = {
      id: "other",
      bookingId: "other-booking",
      driverProfileId: DRIVER_PROFILE_ID,
      vehicleId: VEHICLE_ID,
      status: "ACCEPTED",
      expiresAt: NOW,
      acceptedAt: NOW,
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
      createdAt: NOW,
      updatedAt: NOW,
    };
    const h = buildHarness({ activeOffersForDriver: [otherActive] });

    await expect(
      h.useCase.execute({
        bookingId: BOOKING_ID,
        driverProfileId: DRIVER_PROFILE_ID,
        vehicleId: VEHICLE_ID,
        score: 0.5,
        distanceKm: 1,
      }),
    ).rejects.toBeInstanceOf(DriverHasActiveOfferError);

    expect(h.offerRepo.create).not.toHaveBeenCalled();
  });

  it("throws ConcurrentDispatchError when the booking version race is lost on attempt counter bump", async () => {
    const h = buildHarness();
    (h.bookingRepo.recordDispatchFailure as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await expect(
      h.useCase.execute({
        bookingId: BOOKING_ID,
        driverProfileId: DRIVER_PROFILE_ID,
        vehicleId: VEHICLE_ID,
        score: 0.5,
        distanceKm: 1,
      }),
    ).rejects.toBeInstanceOf(ConcurrentDispatchError);

    expect(h.offerRepo.create).not.toHaveBeenCalled();
  });

  it("attempts counter respects existing booking.dispatchAttempts (increment by 1)", async () => {
    const h = buildHarness({ booking: { dispatchAttempts: 2 } });

    await h.useCase.execute({
      bookingId: BOOKING_ID,
      driverProfileId: DRIVER_PROFILE_ID,
      vehicleId: VEHICLE_ID,
      score: 0.5,
      distanceKm: 1,
    });

    expect(h.bookingRepo.recordDispatchFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dispatchAttempts: 3 }),
    );
    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ attempts: 3 }),
      }),
    );
  });

  it("payload carries no PII (no lat / lng / plate / address)", async () => {
    const h = buildHarness();

    await h.useCase.execute({
      bookingId: BOOKING_ID,
      driverProfileId: DRIVER_PROFILE_ID,
      vehicleId: VEHICLE_ID,
      score: 0.5,
      distanceKm: 1,
    });

    const call = (h.outbox.write as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const payload = call[1].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("lat");
    expect(payload).not.toHaveProperty("lng");
    expect(payload).not.toHaveProperty("pickupLat");
    expect(payload).not.toHaveProperty("pickupLng");
    expect(payload).not.toHaveProperty("plate");
    expect(payload).not.toHaveProperty("pickupAddress");
  });
});
