import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcceptDriverOfferUseCase } from "./accept-driver-offer.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import {
  ConcurrentDispatchError,
  DriverHasActiveOfferError,
  OfferExpiredError,
  OfferForbiddenError,
  OfferNotFoundError,
  OfferStateTransitionError,
} from "../../domain/errors/dispatch-errors";
import { DISPATCH_EVENT_TYPES } from "../../domain/events/dispatch-events";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type {
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import type { VehicleAvailabilityRepositoryPort } from "../../../supply/application/ports/vehicle-availability.repository.port";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";
import type { DriverOfferRepositoryPort } from "../ports/driver-offer.repository.port";

const NOW = new Date("2026-08-15T10:00:00.000Z");
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
    status: "PENDING",
    expiresAt: new Date("2026-08-15T10:05:00.000Z"),
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
    createdAt: new Date("2026-08-15T10:00:00.000Z"),
    updatedAt: new Date("2026-08-15T10:00:00.000Z"),
    ...overrides,
  };
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
    dispatchAttempts: 1,
    lastDispatchAt: new Date("2026-08-15T10:00:00.000Z"),
    dispatchFailedReason: null,
    version: 0,
    createdAt: new Date("2026-08-15T09:00:00.000Z"),
    updatedAt: new Date("2026-08-15T09:00:00.000Z"),
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
    commissionRate: "0.15",
    version: 0,
    createdAt: new Date("2026-08-01"),
  };
}

interface Harness {
  useCase: AcceptDriverOfferUseCase;
  offer: DriverOfferEntity;
  booking: BookingEntity;
  offerRepo: DriverOfferRepositoryPort;
  bookingRepo: BookingRepositoryPort;
  outbox: OutboxWriterPort;
  availRepo: VehicleAvailabilityRepositoryPort;
}

function buildHarness(
  overrides: {
    offer?: Partial<DriverOfferEntity>;
    booking?: Partial<BookingEntity>;
    otherActiveOffersForDriver?: DriverOfferEntity[];
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
      return {
        ...offer,
        status: input.toStatus,
        version: offer.version + 1,
        ...(input.fields?.acceptedAt ? { acceptedAt: input.fields.acceptedAt } : {}),
        ...(input.fields?.expiredAt ? { expiredAt: input.fields.expiredAt } : {}),
      };
    }),
    findActiveByDriverId: vi.fn(async () => overrides.otherActiveOffersForDriver ?? [offer]),
    findActiveByBookingId: vi.fn(),
    findPriorDriverIdsForBooking: vi.fn(),
    findExpiredPending: vi.fn(),
    list: vi.fn(),
  };

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async (_tx, id) => (id === booking.id ? booking : null)),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    assignDriver: vi.fn(async (_tx, input) => {
      if (input.fromVersion !== booking.version) return null;
      const assigned: BookingEntity = {
        ...booking,
        status: "DRIVER_ASSIGNED",
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        driverAssignedAt: input.assignedAt,
      };
      return assigned;
    }),
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

  const availRepo: VehicleAvailabilityRepositoryPort = {
    create: vi.fn(async () => ({
      id: "av-1",
      vehicleId: VEHICLE_ID,
      driverProfileId: DRIVER_PROFILE_ID,
      startAt: booking.eventStartAt,
      endAt: booking.eventEndAt,
      type: "BOOKED" as const,
      bookingId: booking.id,
      reason: null,
      createdAt: NOW,
    })),
    findActiveById: vi.fn(),
    findBookedForBooking: vi.fn(),
    findOverlapping: vi.fn(),
    listForVehicle: vi.fn(),
    softDelete: vi.fn(),
  };

  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };

  const useCase = new AcceptDriverOfferUseCase(
    offerRepo,
    bookingRepo,
    driverRepo,
    availRepo,
    new FakeTxRunner(),
    outbox,
    new FrozenClock(NOW),
  );

  return { useCase, offer, booking, offerRepo, bookingRepo, outbox, availRepo };
}

describe("AcceptDriverOfferUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: PENDING + fresh + owns offer → ACCEPTED + booking DRIVER_ASSIGNED + BOOKED availability + outbox", async () => {
    const h = buildHarness();

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    expect(result.status).toBe("ACCEPTED");

    expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        offerId: OFFER_ID,
        fromVersion: 0,
        toStatus: "ACCEPTED",
        fields: expect.objectContaining({ acceptedAt: NOW }),
      }),
    );
    expect(h.bookingRepo.assignDriver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: BOOKING_ID,
        driverId: DRIVER_PROFILE_ID,
        vehicleId: VEHICLE_ID,
        assignedAt: NOW,
      }),
    );
    expect(h.availRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        vehicleId: VEHICLE_ID,
        driverProfileId: DRIVER_PROFILE_ID,
        bookingId: BOOKING_ID,
        type: "BOOKED",
      }),
    );
    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: DISPATCH_EVENT_TYPES.DRIVER_OFFER_ACCEPTED,
        aggregateType: "Booking",
        aggregateId: BOOKING_ID,
      }),
    );
  });

  it("returns OfferNotFoundError when the offer id does not exist", async () => {
    const h = buildHarness();

    await expect(
      h.useCase.execute({
        offerId: "00000000-0000-4000-8000-000000000000",
        driverUserId: DRIVER_USER_ID,
      }),
    ).rejects.toBeInstanceOf(OfferNotFoundError);

    expect(h.bookingRepo.assignDriver).not.toHaveBeenCalled();
  });

  it("returns OfferForbiddenError when the driver does not own the offer", async () => {
    const h = buildHarness({
      driver: {
        ...driverProfile(),
        id: "99999999-9999-4999-8999-999999999999",
      },
    });

    await expect(
      h.useCase.execute({ offerId: OFFER_ID, driverUserId: DRIVER_USER_ID }),
    ).rejects.toBeInstanceOf(OfferForbiddenError);

    expect(h.bookingRepo.assignDriver).not.toHaveBeenCalled();
  });

  it("idempotent re-accept (status already ACCEPTED) returns offer without further writes", async () => {
    const h = buildHarness({
      offer: { status: "ACCEPTED", acceptedAt: new Date("2026-08-15T09:59:00.000Z") },
    });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    expect(result.status).toBe("ACCEPTED");
    expect(h.offerRepo.transitionStatus).not.toHaveBeenCalled();
    expect(h.bookingRepo.assignDriver).not.toHaveBeenCalled();
    expect(h.availRepo.create).not.toHaveBeenCalled();
  });

  it("auto-expires + throws OfferExpiredError when now > expiresAt", async () => {
    const h = buildHarness({
      offer: { expiresAt: new Date("2026-08-15T09:58:00.000Z") }, // already past
    });

    await expect(
      h.useCase.execute({ offerId: OFFER_ID, driverUserId: DRIVER_USER_ID }),
    ).rejects.toBeInstanceOf(OfferExpiredError);

    expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toStatus: "EXPIRED" }),
    );
    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: DISPATCH_EVENT_TYPES.DRIVER_OFFER_EXPIRED,
      }),
    );
    expect(h.bookingRepo.assignDriver).not.toHaveBeenCalled();
  });

  it("rejects accept when offer is already in a terminal state (REJECTED)", async () => {
    const h = buildHarness({
      offer: { status: "REJECTED", rejectedAt: new Date("2026-08-15T09:55:00.000Z") },
    });

    await expect(
      h.useCase.execute({ offerId: OFFER_ID, driverUserId: DRIVER_USER_ID }),
    ).rejects.toBeInstanceOf(OfferStateTransitionError);
  });

  it("throws DriverHasActiveOfferError when the driver has another offer in flight", async () => {
    const otherOffer = buildOffer({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "ON_THE_WAY",
    });
    const h = buildHarness({
      otherActiveOffersForDriver: [buildOffer(), otherOffer],
    });

    await expect(
      h.useCase.execute({ offerId: OFFER_ID, driverUserId: DRIVER_USER_ID }),
    ).rejects.toBeInstanceOf(DriverHasActiveOfferError);

    expect(h.bookingRepo.assignDriver).not.toHaveBeenCalled();
  });

  it("throws ConcurrentDispatchError when assignDriver loses the version race", async () => {
    // Simulate a parallel write that bumped the booking version between
    // findById and assignDriver — the use case must surface the conflict
    // rather than retrying silently.
    const h = buildHarness();
    (h.bookingRepo.assignDriver as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      h.useCase.execute({ offerId: OFFER_ID, driverUserId: DRIVER_USER_ID }),
    ).rejects.toBeInstanceOf(ConcurrentDispatchError);
  });
});
