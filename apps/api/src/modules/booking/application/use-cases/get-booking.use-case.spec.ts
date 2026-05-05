import { describe, expect, it, vi } from "vitest";

import { GetBookingUseCase } from "./get-booking.use-case";
import { BookingAccessDeniedError, BookingNotFoundError } from "../../domain/errors/booking-errors";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity } from "../../domain/booking-types";
import type { BookingRepositoryPort } from "../../domain/ports/booking.repository.port";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "55555555-5555-4555-8555-555555555555";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildBooking(): BookingEntity {
  return {
    id: BOOKING_ID,
    customerId: OWNER_ID,
    priceQuoteId: "33333333-3333-4333-8333-333333333333",
    status: "CONFIRMED",
    vehicleTypeId: "44",
    categoryId: "55",
    pickupLat: "0" as never,
    pickupLng: "0" as never,
    pickupAddress: "",
    dropoffLat: "0" as never,
    dropoffLng: "0" as never,
    dropoffAddress: "",
    eventStartAt: new Date(),
    eventEndAt: new Date(),
    totalAmount: "0" as never,
    currency: "TRY",
    confirmedAt: null,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function build(stored: BookingEntity | null) {
  const repo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async () => stored),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    assignDriver: vi.fn(),
    reassignDriver: vi.fn(),
    recordDispatchFailure: vi.fn(),
    findDispatchable: vi.fn(),
  };
  return new GetBookingUseCase(repo, new FakeTxRunner());
}

describe("GetBookingUseCase", () => {
  it("returns booking for the owner", async () => {
    const uc = build(buildBooking());
    const result = await uc.execute(BOOKING_ID, { userId: OWNER_ID, role: "CUSTOMER" });
    expect(result.id).toBe(BOOKING_ID);
  });

  it("returns booking for ADMIN actor regardless of ownership", async () => {
    const uc = build(buildBooking());
    const result = await uc.execute(BOOKING_ID, { userId: STRANGER_ID, role: "ADMIN" });
    expect(result.id).toBe(BOOKING_ID);
  });

  it("rejects with BookingAccessDeniedError when caller is not owner", async () => {
    const uc = build(buildBooking());
    await expect(
      uc.execute(BOOKING_ID, { userId: STRANGER_ID, role: "CUSTOMER" }),
    ).rejects.toBeInstanceOf(BookingAccessDeniedError);
  });

  it("rejects with BookingNotFoundError when no row", async () => {
    const uc = build(null);
    await expect(
      uc.execute(BOOKING_ID, { userId: OWNER_ID, role: "CUSTOMER" }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });
});
