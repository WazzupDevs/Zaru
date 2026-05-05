import { type ConfigService } from "@nestjs/config";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AssignDriverToBookingUseCase } from "./assign-driver-to-booking.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { BookingNotFoundError } from "../../../booking/domain/errors/booking-errors";
import {
  BookingNotDispatchableError,
  ConcurrentDispatchError,
} from "../../domain/errors/dispatch-errors";
import { DispatchPolicyService } from "../../domain/services/dispatch-policy.service";
import { DriverMatcher } from "../../domain/services/driver-matcher.service";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { Env } from "../../../../config/env";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type { VehicleAvailabilityRepositoryPort } from "../../../supply/application/ports/vehicle-availability.repository.port";
import type { DriverSearchRepositoryPort } from "../../application/ports/driver-search.repository.port";
import type { DriverCandidate } from "../../domain/services/driver-matcher.service";

const NOW = new Date("2026-08-15T10:00:00.000Z");
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const VEHICLE_TYPE_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";

const config = {
  get: (key: string) => {
    const m: Record<string, unknown> = {
      DISPATCH_MAX_RADIUS_KM: 25,
      DISPATCH_MIN_RATING: 4.0,
      DISPATCH_DISTANCE_WEIGHT: 0.7,
      DISPATCH_RATING_WEIGHT: 0.3,
      DISPATCH_MAX_ATTEMPTS: 3,
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

function buildBooking(overrides: Partial<BookingEntity> = {}): BookingEntity {
  return {
    id: BOOKING_ID,
    customerId: CUSTOMER_ID,
    priceQuoteId: "55555555-5555-4555-8555-555555555555",
    status: "CONFIRMED",
    vehicleTypeId: VEHICLE_TYPE_ID,
    categoryId: CATEGORY_ID,
    pickupLat: "41.0082000" as never,
    pickupLng: "28.9784000" as never,
    pickupAddress: "Sultanahmet, Istanbul",
    dropoffLat: "41.0428000" as never,
    dropoffLng: "29.0093000" as never,
    dropoffAddress: "Besiktas, Istanbul",
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

function candidate(id: string, distanceKm: number, rating = 4.8): DriverCandidate {
  return {
    driverProfileId: id,
    userId: `user-${id}`,
    vehicleId: `vehicle-${id}`,
    vehicleTypeId: VEHICLE_TYPE_ID,
    distanceKm,
    ratingAverage: rating,
    ratingCount: 10,
  };
}

function buildHarness(initial: Partial<BookingEntity> = {}, candidates: DriverCandidate[] = []) {
  let stored: BookingEntity | null = buildBooking(initial);

  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async (_tx, id) => (stored && stored.id === id ? stored : null)),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    findDispatchable: vi.fn(),
    recordDispatchFailure: vi.fn(async (_tx, input) => {
      if (!stored || stored.version !== input.fromVersion) return false;
      stored = {
        ...stored,
        dispatchAttempts: input.dispatchAttempts,
        lastDispatchAt: input.lastDispatchAt,
        dispatchFailedReason: input.dispatchFailedReason,
        version: stored.version + 1,
      };
      return true;
    }),
    assignDriver: vi.fn(async (_tx, input) => {
      if (!stored || stored.version !== input.fromVersion || stored.status !== "CONFIRMED") {
        return null;
      }
      stored = {
        ...stored,
        status: "DRIVER_ASSIGNED",
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        driverAssignedAt: input.assignedAt,
        dispatchAttempts: input.dispatchAttempts,
        lastDispatchAt: input.assignedAt,
        dispatchFailedReason: null,
        version: stored.version + 1,
      };
      return stored;
    }),
    reassignDriver: vi.fn(),
  };

  const searchRepo: DriverSearchRepositoryPort = {
    findCandidates: vi.fn(async () => candidates),
  };

  const availRepo: Pick<VehicleAvailabilityRepositoryPort, "create"> & {
    create: ReturnType<typeof vi.fn>;
  } = {
    create: vi.fn(async () => ({
      id: "av-1",
      vehicleId: "vehicle-x",
      driverProfileId: "dp-x",
      startAt: NOW,
      endAt: NOW,
      type: "BOOKED" as const,
      bookingId: BOOKING_ID,
      reason: null,
      createdAt: NOW,
    })),
  };

  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };
  const clock = new FrozenClock(NOW);
  const matcher = new DriverMatcher();
  const policyService = new DispatchPolicyService(config);

  const useCase = new AssignDriverToBookingUseCase(
    bookingRepo,
    searchRepo,
    availRepo as unknown as VehicleAvailabilityRepositoryPort,
    new FakeTxRunner(),
    outbox,
    clock,
    matcher,
    policyService,
    config,
  );

  return {
    useCase,
    bookingRepo,
    searchRepo,
    availRepo,
    outbox,
    getStored: () => stored,
  };
}

describe("AssignDriverToBookingUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: matches closest driver, swaps to DRIVER_ASSIGNED, blocks availability, emits event", async () => {
    const h = buildHarness({}, [
      candidate("d-far", 15, 5.0),
      candidate("d-close", 2, 4.5),
      candidate("d-mid", 8, 4.8),
    ]);
    const result = await h.useCase.execute({ bookingId: BOOKING_ID });

    expect(result.success).toBe(true);
    expect(result.driverProfileId).toBe("d-close");

    const stored = h.getStored();
    expect(stored?.status).toBe("DRIVER_ASSIGNED");
    expect(stored?.driverId).toBe("d-close");
    expect(stored?.vehicleId).toBe("vehicle-d-close");
    expect(stored?.dispatchAttempts).toBe(1);

    expect(h.availRepo.create).toHaveBeenCalledOnce();
    const availArg = h.availRepo.create.mock.calls[0]![1];
    expect(availArg).toMatchObject({
      vehicleId: "vehicle-d-close",
      driverProfileId: "d-close",
      type: "BOOKED",
      bookingId: BOOKING_ID,
    });

    expect(h.outbox.write).toHaveBeenCalledOnce();
    const evt = vi.mocked(h.outbox.write).mock.calls[0]![1];
    expect(evt.eventType).toBe("dispatch.DriverDispatched");
    const payload = evt.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      bookingId: BOOKING_ID,
      driverProfileId: "d-close",
      vehicleId: "vehicle-d-close",
      attempts: 1,
    });
    expect(typeof payload.distanceKm).toBe("number");
    expect(typeof payload.score).toBe("number");
  });

  it("outbox payload carries NO PII (no plate, no name, no lat/lng/address)", async () => {
    const h = buildHarness({}, [candidate("d-1", 5, 4.9)]);
    await h.useCase.execute({ bookingId: BOOKING_ID });

    const payload = vi.mocked(h.outbox.write).mock.calls[0]![1].payload as Record<string, unknown>;
    const stringified = JSON.stringify(payload);
    expect(stringified).not.toContain("Sultanahmet");
    expect(stringified).not.toContain("Besiktas");
    expect(stringified).not.toContain("41.00");
    expect(payload).not.toHaveProperty("pickupLat");
    expect(payload).not.toHaveProperty("dropoffLat");
    expect(payload).not.toHaveProperty("plateNumber");
  });

  it("rejects bookings not in CONFIRMED status", async () => {
    const h = buildHarness({ status: "DRAFT" }, [candidate("d-1", 5, 4.9)]);
    await expect(h.useCase.execute({ bookingId: BOOKING_ID })).rejects.toBeInstanceOf(
      BookingNotDispatchableError,
    );
    expect(h.availRepo.create).not.toHaveBeenCalled();
    expect(h.outbox.write).not.toHaveBeenCalled();
  });

  it("rejects DRIVER_ASSIGNED bookings (already dispatched)", async () => {
    const h = buildHarness({ status: "DRIVER_ASSIGNED" }, [candidate("d-1", 5, 4.9)]);
    await expect(h.useCase.execute({ bookingId: BOOKING_ID })).rejects.toBeInstanceOf(
      BookingNotDispatchableError,
    );
  });

  it("rejects when booking does not exist", async () => {
    const h = buildHarness({}, []);
    await expect(
      h.useCase.execute({ bookingId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });

  it("records failure with no_drivers_in_radius when search returns empty", async () => {
    const h = buildHarness({}, []);
    const result = await h.useCase.execute({ bookingId: BOOKING_ID });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_drivers_in_radius");

    expect(h.bookingRepo.recordDispatchFailure).toHaveBeenCalledOnce();
    const stored = h.getStored();
    expect(stored?.status).toBe("CONFIRMED");
    expect(stored?.dispatchAttempts).toBe(1);
    expect(stored?.dispatchFailedReason).toBe("no_drivers_in_radius");

    const evt = vi.mocked(h.outbox.write).mock.calls[0]![1];
    expect(evt.eventType).toBe("dispatch.DispatchFailed");
    const payload = evt.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      bookingId: BOOKING_ID,
      attempts: 1,
      reason: "no_drivers_in_radius",
      requiresManualReview: false,
    });
  });

  it("records failure with no_eligible_drivers when candidates exist but none pass policy", async () => {
    // Single candidate beyond radius cap → matcher filters out
    const h = buildHarness({}, [candidate("d-far", 30, 5.0)]);
    const result = await h.useCase.execute({ bookingId: BOOKING_ID });

    expect(result.reason).toBe("no_eligible_drivers");
    const evt = vi.mocked(h.outbox.write).mock.calls[0]![1];
    expect((evt.payload as Record<string, unknown>).reason).toBe("no_eligible_drivers");
  });

  it("flags requiresManualReview=true after attempts reach max", async () => {
    const h = buildHarness({ dispatchAttempts: 2 }, []); // 2 already + this attempt = 3 = max
    await h.useCase.execute({ bookingId: BOOKING_ID });
    const payload = vi.mocked(h.outbox.write).mock.calls[0]![1].payload as Record<string, unknown>;
    expect(payload.requiresManualReview).toBe(true);
    expect(payload.attempts).toBe(3);
  });

  it("excludeDriverIds is forwarded to the search repository (manual reassign)", async () => {
    const h = buildHarness({}, [candidate("d-new", 3, 4.9)]);
    await h.useCase.execute({
      bookingId: BOOKING_ID,
      excludeDriverIds: ["d-previous"],
    });
    const arg = vi.mocked(h.searchRepo.findCandidates).mock.calls[0]![1];
    expect(arg.excludeDriverIds).toEqual(["d-previous"]);
  });

  it("throws ConcurrentDispatchError when assignDriver returns null (version stale)", async () => {
    const h = buildHarness({}, [candidate("d-1", 5, 4.9)]);
    // Force the assign step to lose the optimistic-lock race
    vi.mocked(h.bookingRepo.assignDriver).mockResolvedValueOnce(null);
    await expect(h.useCase.execute({ bookingId: BOOKING_ID })).rejects.toBeInstanceOf(
      ConcurrentDispatchError,
    );
    expect(h.availRepo.create).not.toHaveBeenCalled();
  });
});
