import { type ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { BookingDispatchService } from "./booking-dispatch.service";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";

import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { Env } from "../../../../config/env";
import type { BookingEntity } from "../../../booking/domain/booking-types";
import type { BookingRepositoryPort } from "../../../booking/domain/ports/booking.repository.port";
import type {
  AssignDriverToBookingResult,
  AssignDriverToBookingUseCase,
} from "../../application/use-cases/assign-driver-to-booking.use-case";

const NOW = new Date("2026-08-15T10:00:00.000Z");

const config = {
  get: (key: string) => {
    const m: Record<string, unknown> = {
      DISPATCH_MAX_ATTEMPTS: 3,
      DISPATCH_RETRY_COOLDOWN_MS: 60_000,
    };
    return m[key];
  },
} as unknown as ConfigService<Env, true>;

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildBooking(id: string): BookingEntity {
  return {
    id,
    customerId: "cust",
    priceQuoteId: "quote",
    status: "CONFIRMED",
    vehicleTypeId: "vt",
    categoryId: "cat",
    pickupLat: "0" as never,
    pickupLng: "0" as never,
    pickupAddress: "",
    dropoffLat: "0" as never,
    dropoffLng: "0" as never,
    dropoffAddress: "",
    eventStartAt: NOW,
    eventEndAt: NOW,
    totalAmount: "0" as never,
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
  };
}

function build(bookings: BookingEntity[], results: (AssignDriverToBookingResult | Error)[]) {
  const bookingRepo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    findDispatchable: vi.fn(async () => bookings),
    recordDispatchFailure: vi.fn(),
    assignDriver: vi.fn(),
    reassignDriver: vi.fn(),
  };

  let i = 0;
  const assignUseCase = {
    execute: vi.fn(async () => {
      const next = results[i++];
      if (next instanceof Error) throw next;
      return next!;
    }),
  } as unknown as AssignDriverToBookingUseCase;

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const svc = new BookingDispatchService(
    bookingRepo,
    new FakeTxRunner(),
    new FrozenClock(NOW),
    assignUseCase,
    logger as never,
    config,
  );
  return { svc, bookingRepo, assignUseCase };
}

describe("BookingDispatchService.sweep", () => {
  it("queries findDispatchable with maxAttempts + cooldownMs from config", async () => {
    const { svc, bookingRepo } = build([], []);
    await svc.sweep();
    expect(bookingRepo.findDispatchable).toHaveBeenCalledOnce();
    const arg = vi.mocked(bookingRepo.findDispatchable).mock.calls[0]![1];
    expect(arg.maxAttempts).toBe(3);
    expect(arg.cooldownMs).toBe(60_000);
    expect(arg.now).toEqual(NOW);
  });

  it("returns 0 across the board when no candidates", async () => {
    const { svc } = build([], []);
    expect(await svc.sweep()).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
  });

  it("counts succeeded/failed correctly across mixed results", async () => {
    const { svc } = build(
      [buildBooking("b1"), buildBooking("b2"), buildBooking("b3")],
      [
        { success: true, driverProfileId: "d1" },
        { success: false, reason: "no_drivers_in_radius" },
        { success: true, driverProfileId: "d3" },
      ],
    );
    expect(await svc.sweep()).toEqual({ attempted: 3, succeeded: 2, failed: 1 });
  });

  it("isolates exceptions — one throw does not stop the batch", async () => {
    const { svc } = build(
      [buildBooking("b1"), buildBooking("b2")],
      [new Error("boom"), { success: true, driverProfileId: "d2" }],
    );
    expect(await svc.sweep()).toEqual({ attempted: 2, succeeded: 1, failed: 1 });
  });
});
