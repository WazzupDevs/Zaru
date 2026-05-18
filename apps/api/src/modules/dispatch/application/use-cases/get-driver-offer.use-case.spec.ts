import { beforeEach, describe, expect, it, vi } from "vitest";

import { GetDriverOfferUseCase } from "./get-driver-offer.use-case";
import {
  ConcurrentDispatchError,
  OfferForbiddenError,
  OfferNotFoundError,
} from "../../domain/errors/dispatch-errors";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type {
  UserRecord,
  UserRepositoryPort,
} from "../../../identity/application/ports/user.repository.port";
import type {
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import type {
  VehicleRecord,
  VehicleRepositoryPort,
} from "../../../supply/application/ports/vehicle.repository.port";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";
import type { DriverOfferRepositoryPort } from "../ports/driver-offer.repository.port";

const OFFER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_USER_ID = "44444444-4444-4444-8444-444444444444";
const VEHICLE_ID = "55555555-5555-4555-8555-555555555555";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";

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
    customerId: CUSTOMER_ID,
    priceQuoteId: "q-1",
    status: "DRIVER_ASSIGNED",
    vehicleTypeId: "vt-1",
    categoryId: "cat-1",
    pickupLat: "41.0082000" as never,
    pickupLng: "28.9784000" as never,
    pickupAddress: "Sultanahmet Meydani 1",
    dropoffLat: "41.0428000" as never,
    dropoffLng: "29.0093000" as never,
    dropoffAddress: "Besiktas Iskele",
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

function customer(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: CUSTOMER_ID,
    phoneE164: "+905551234567",
    displayName: "Ayse Customer",
    role: "CUSTOMER",
    phoneVerifiedAt: new Date("2026-08-01"),
    lastLoginAt: new Date("2026-08-15"),
    expoPushToken: null,
    pushTokenUpdatedAt: null,
    createdAt: new Date("2026-08-01"),
    ...overrides,
  };
}

function vehicle(overrides: Partial<VehicleRecord> = {}): VehicleRecord {
  return {
    id: VEHICLE_ID,
    driverProfileId: DRIVER_PROFILE_ID,
    vehicleTypeId: "vt-1",
    plateNumber: "34AB1234",
    brand: "Ford",
    model: "Transit",
    year: 2022,
    color: "white",
    attributes: {},
    photoKeys: [],
    status: "ACTIVE",
    version: 0,
    createdAt: new Date("2026-08-01"),
    ...overrides,
  };
}

interface Harness {
  useCase: GetDriverOfferUseCase;
  offerRepo: DriverOfferRepositoryPort;
  bookingRepo: BookingRepositoryPort;
  userRepo: UserRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
}

function buildHarness(
  overrides: {
    offer?: Partial<DriverOfferEntity>;
    booking?: Partial<BookingEntity> | null;
    driver?: DriverProfileRecord | null;
    customer?: Partial<UserRecord> | null;
    vehicle?: Partial<VehicleRecord> | null;
  } = {},
): Harness {
  const offer = buildOffer(overrides.offer);
  const bookingRow = overrides.booking === null ? null : buildBooking(overrides.booking ?? {});
  const customerRow = overrides.customer === null ? null : customer(overrides.customer ?? {});
  const vehicleRow = overrides.vehicle === null ? null : vehicle(overrides.vehicle ?? {});

  const offerRepo: DriverOfferRepositoryPort = {
    findById: vi.fn(async (_tx, id) => (id === offer.id ? offer : null)),
    create: vi.fn(),
    transitionStatus: vi.fn(),
    findActiveByDriverId: vi.fn(),
    findActiveByBookingId: vi.fn(),
    findPriorDriverIdsForBooking: vi.fn(),
    findExpiredPending: vi.fn(),
    list: vi.fn(),
  };

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async () => bookingRow),
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

  const userRepo: UserRepositoryPort = {
    findActiveByPhone: vi.fn(),
    findActiveById: vi.fn(async () => customerRow),
    createVerified: vi.fn(),
    touchLastLogin: vi.fn(),
    updateRole: vi.fn(),
    updatePushToken: vi.fn(),
  };

  const vehicleRepo: VehicleRepositoryPort = {
    create: vi.fn(),
    findActiveById: vi.fn(async () => vehicleRow),
    findActiveByPlate: vi.fn(),
    listByDriver: vi.fn(),
    updateAttributes: vi.fn(),
    setStatus: vi.fn(),
  };

  const useCase = new GetDriverOfferUseCase(
    offerRepo,
    driverRepo,
    bookingRepo,
    userRepo,
    vehicleRepo,
    new FakeTxRunner(),
  );

  return { useCase, offerRepo, bookingRepo, userRepo, vehicleRepo };
}

describe("GetDriverOfferUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns offer + booking + customer + vehicle + earnings", async () => {
    const h = buildHarness();

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    expect(result).toMatchObject({
      offerId: OFFER_ID,
      bookingId: BOOKING_ID,
      status: "ACCEPTED",
      booking: {
        pickupAddress: "Sultanahmet Meydani 1",
        dropoffAddress: "Besiktas Iskele",
        totalAmount: { amount: "6877.00", currency: "TRY" },
      },
      vehicle: {
        brand: "Ford",
        model: "Transit",
        plateNumber: "34AB1234",
      },
      customer: {
        displayName: "Ayse Customer",
        phoneMasked: "+90555***4567",
      },
      driverEarnings: { amount: "5501.60", currency: "TRY" },
    });
  });

  it("uses driver.commissionRate (not a global env) for earnings split", async () => {
    const h = buildHarness({
      driver: driverProfile({ commissionRate: "0.15" }),
    });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    // 6877.00 × (1 - 0.15) = 5845.45
    expect(result.driverEarnings).toEqual({ amount: "5845.45", currency: "TRY" });
  });

  it("returns null vehicle when the vehicle row is missing/soft-deleted", async () => {
    const h = buildHarness({ vehicle: null });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    expect(result.vehicle).toBeNull();
  });

  it("displayName is null when the customer hasn't set one", async () => {
    const h = buildHarness({ customer: { displayName: null } });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    expect(result.customer.displayName).toBeNull();
  });

  it("masks the customer phone even when the customer is missing entirely", async () => {
    const h = buildHarness({ customer: null });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    expect(result.customer.displayName).toBeNull();
    expect(result.customer.phoneMasked).toBe("***");
  });

  it("throws OfferNotFoundError when the offer id is missing", async () => {
    const h = buildHarness();

    await expect(
      h.useCase.execute({
        offerId: "00000000-0000-4000-8000-000000000000",
        driverUserId: DRIVER_USER_ID,
      }),
    ).rejects.toBeInstanceOf(OfferNotFoundError);
  });

  it("throws OfferForbiddenError for another driver", async () => {
    const h = buildHarness({
      driver: driverProfile({ id: "99999999-9999-4999-8999-999999999999" }),
    });

    await expect(
      h.useCase.execute({ offerId: OFFER_ID, driverUserId: DRIVER_USER_ID }),
    ).rejects.toBeInstanceOf(OfferForbiddenError);
  });

  it("throws ConcurrentDispatchError when the booking row is missing", async () => {
    const h = buildHarness({ booking: null });

    await expect(
      h.useCase.execute({ offerId: OFFER_ID, driverUserId: DRIVER_USER_ID }),
    ).rejects.toBeInstanceOf(ConcurrentDispatchError);
  });

  it("never returns the customer's full phone in the response", async () => {
    const h = buildHarness({
      customer: { phoneE164: "+905558887766" },
    });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain("+905558887766");
    expect(result.customer.phoneMasked).toBe("+90555***7766");
  });
});
