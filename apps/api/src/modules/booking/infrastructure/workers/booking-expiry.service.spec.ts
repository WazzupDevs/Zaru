import { describe, expect, it, vi } from "vitest";

import { BOOKING_DRAFT_TTL_MS } from "./booking-expiry.constants";
import { BookingExpiryService } from "./booking-expiry.service";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity } from "../../domain/booking-types";
import type { BookingRepositoryPort } from "../../domain/ports/booking.repository.port";

const NOW = new Date("2026-08-15T10:00:00.000Z");

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildBooking(id: string, createdAt: Date): BookingEntity {
  return {
    id,
    customerId: "cust-1",
    priceQuoteId: "quote-1",
    status: "EXPIRED",
    vehicleTypeId: "vt",
    categoryId: "cat",
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
    expiredAt: NOW,
    cancellationReason: null,
    cancelledByUserId: null,
    driverId: null,
    vehicleId: null,
    version: 1,
    createdAt,
    updatedAt: NOW,
  };
}

function buildHarness(expiredRows: BookingEntity[]) {
  const repo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(),
    transitionStatus: vi.fn(),
    expireDraftsOlderThan: vi.fn(async () => expiredRows),
    listForCustomer: vi.fn(),
    assignDriver: vi.fn(),
    reassignDriver: vi.fn(),
    recordDispatchFailure: vi.fn(),
    findDispatchable: vi.fn(),
  };
  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };
  const clock = new FrozenClock(NOW);
  const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const svc = new BookingExpiryService(repo, new FakeTxRunner(), outbox, clock, logger as never);
  return { svc, repo, outbox, clock };
}

describe("BookingExpiryService.sweep", () => {
  it("computes cutoff = now - BOOKING_DRAFT_TTL_MS and emits one event per expired row", async () => {
    const expired = [
      buildBooking("b1", new Date(NOW.getTime() - BOOKING_DRAFT_TTL_MS - 60_000)),
      buildBooking("b2", new Date(NOW.getTime() - BOOKING_DRAFT_TTL_MS - 5 * 60_000)),
    ];
    const h = buildHarness(expired);

    const result = await h.svc.sweep();

    expect(result.expired).toBe(2);
    expect(h.repo.expireDraftsOlderThan).toHaveBeenCalledOnce();
    const [, cutoff, now] = vi.mocked(h.repo.expireDraftsOlderThan).mock.calls[0]!;
    expect(now).toEqual(NOW);
    expect(cutoff.getTime()).toBe(NOW.getTime() - BOOKING_DRAFT_TTL_MS);

    expect(h.outbox.write).toHaveBeenCalledTimes(2);
    const evtTypes = vi.mocked(h.outbox.write).mock.calls.map((c) => c[1].eventType);
    expect(evtTypes).toEqual(["booking.BookingExpired", "booking.BookingExpired"]);
    const payloads = vi
      .mocked(h.outbox.write)
      .mock.calls.map((c) => c[1].payload as Record<string, unknown>);
    expect(payloads.map((p) => p.bookingId)).toEqual(["b1", "b2"]);
  });

  it("returns 0 and writes nothing when no DRAFT rows are old enough", async () => {
    const h = buildHarness([]);
    const result = await h.svc.sweep();
    expect(result.expired).toBe(0);
    expect(h.outbox.write).not.toHaveBeenCalled();
  });
});
