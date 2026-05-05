import { describe, expect, it, beforeEach, vi } from "vitest";

import { CancelBookingUseCase } from "./cancel-booking.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import {
  BookingAccessDeniedError,
  BookingNotCancellableError,
  BookingNotFoundError,
  CancellationReasonRequiredError,
  ConcurrentBookingModificationError,
} from "../../domain/errors/booking-errors";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type { BookingEntity, BookingStatus } from "../../domain/booking-types";
import type { BookingRepositoryPort } from "../../domain/ports/booking.repository.port";

const NOW = new Date("2026-08-15T10:00:00.000Z");
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_USER_ID = "55555555-5555-4555-8555-555555555555";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

function buildBooking(overrides: Partial<BookingEntity> = {}): BookingEntity {
  return {
    id: BOOKING_ID,
    customerId: CUSTOMER_ID,
    priceQuoteId: "33333333-3333-4333-8333-333333333333",
    status: "CONFIRMED",
    vehicleTypeId: "44444444-4444-4444-8444-444444444444",
    categoryId: "55555555-5555-4555-8555-555555555555",
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
    confirmedAt: new Date("2026-08-14T10:00:00.000Z"),
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
    createdAt: new Date("2026-08-14T10:00:00.000Z"),
    updatedAt: new Date("2026-08-14T10:00:00.000Z"),
    ...overrides,
  };
}

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildHarness(initial: Partial<BookingEntity> = {}) {
  let stored: BookingEntity | null = buildBooking(initial);

  const repo: BookingRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(async (_tx, id) => (stored && stored.id === id ? stored : null)),
    transitionStatus: vi.fn(async (_tx, input) => {
      if (!stored) return null;
      if (stored.version !== input.fromVersion) return null;
      stored = {
        ...stored,
        status: input.toStatus,
        version: stored.version + 1,
        ...(input.fields ?? {}),
      } as BookingEntity;
      return stored;
    }),
    expireDraftsOlderThan: vi.fn(),
    listForCustomer: vi.fn(),
    assignDriver: vi.fn(),
    reassignDriver: vi.fn(),
    recordDispatchFailure: vi.fn(),
    findDispatchable: vi.fn(),
  };

  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };
  const clock = new FrozenClock(NOW);
  const useCase = new CancelBookingUseCase(repo, new FakeTxRunner(), outbox, clock);

  return {
    useCase,
    repo,
    outbox,
    clock,
    setStored: (b: BookingEntity | null) => {
      stored = b;
    },
    getStored: () => stored,
  };
}

describe("CancelBookingUseCase — customer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels a CONFIRMED booking and emits BookingCancelled", async () => {
    const h = buildHarness();
    const result = await h.useCase.execute(
      { bookingId: BOOKING_ID, reason: "değiştirdik" },
      { userId: CUSTOMER_ID, role: "CUSTOMER" },
    );

    expect(result.status).toBe("CANCELLED_BY_CUSTOMER");
    expect(result.cancelledAt).toEqual(NOW);
    expect(result.cancelledByUserId).toBe(CUSTOMER_ID);
    expect(result.cancellationReason).toBe("değiştirdik");

    expect(h.outbox.write).toHaveBeenCalledOnce();
    const evt = vi.mocked(h.outbox.write).mock.calls[0]![1];
    expect(evt.eventType).toBe("booking.BookingCancelled");
    const payload = evt.payload as Record<string, unknown>;
    expect(payload.previousStatus).toBe("CONFIRMED");
    expect(payload.cancelledByRole).toBe("CUSTOMER");
    expect(payload).not.toHaveProperty("cancellationReason"); // PII discipline
  });

  it.each(["DRAFT", "CONFIRMED", "DRIVER_ASSIGNED"] as const)(
    "cancels from cancellable state %s",
    async (status) => {
      const h = buildHarness({ status });
      const result = await h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "x" },
        { userId: CUSTOMER_ID, role: "CUSTOMER" },
      );
      expect(result.status).toBe("CANCELLED_BY_CUSTOMER");
    },
  );

  it("rejects IN_PROGRESS booking with BookingNotCancellableError", async () => {
    const h = buildHarness({ status: "IN_PROGRESS" });
    await expect(
      h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "x" },
        { userId: CUSTOMER_ID, role: "CUSTOMER" },
      ),
    ).rejects.toBeInstanceOf(BookingNotCancellableError);
  });

  it("rejects COMPLETED booking with BookingNotCancellableError", async () => {
    const h = buildHarness({ status: "COMPLETED" });
    await expect(
      h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "x" },
        { userId: CUSTOMER_ID, role: "CUSTOMER" },
      ),
    ).rejects.toBeInstanceOf(BookingNotCancellableError);
  });

  it("rejects when booking belongs to another customer", async () => {
    const h = buildHarness();
    await expect(
      h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "x" },
        { userId: OTHER_USER_ID, role: "CUSTOMER" },
      ),
    ).rejects.toBeInstanceOf(BookingAccessDeniedError);
  });

  it("rejects double cancel with BookingNotCancellableError (terminal state)", async () => {
    const h = buildHarness();
    await h.useCase.execute(
      { bookingId: BOOKING_ID, reason: "first" },
      { userId: CUSTOMER_ID, role: "CUSTOMER" },
    );
    await expect(
      h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "second" },
        { userId: CUSTOMER_ID, role: "CUSTOMER" },
      ),
    ).rejects.toBeInstanceOf(BookingNotCancellableError);
  });

  it("rejects empty reason with CancellationReasonRequiredError", async () => {
    const h = buildHarness();
    await expect(
      h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "   " },
        { userId: CUSTOMER_ID, role: "CUSTOMER" },
      ),
    ).rejects.toBeInstanceOf(CancellationReasonRequiredError);
  });

  it("rejects when booking does not exist", async () => {
    const h = buildHarness();
    h.setStored(null);
    await expect(
      h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "x" },
        { userId: CUSTOMER_ID, role: "CUSTOMER" },
      ),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });

  it("surfaces ConcurrentBookingModificationError on optimistic-lock miss", async () => {
    const h = buildHarness();
    // Mutate the stored entity's version between findById and transitionStatus
    // by having transitionStatus look at a stale fromVersion.
    const repo = h.repo;
    const original = repo.transitionStatus.bind(repo);
    vi.mocked(repo.transitionStatus).mockImplementationOnce(async () => null);
    void original;
    await expect(
      h.useCase.execute(
        { bookingId: BOOKING_ID, reason: "x" },
        { userId: CUSTOMER_ID, role: "CUSTOMER" },
      ),
    ).rejects.toBeInstanceOf(ConcurrentBookingModificationError);
  });
});

describe("CancelBookingUseCase — admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin can cancel a CONFIRMED booking belonging to another customer", async () => {
    const h = buildHarness();
    const result = await h.useCase.execute(
      { bookingId: BOOKING_ID, reason: "fraud risk" },
      { userId: ADMIN_ID, role: "ADMIN" },
    );

    expect(result.status).toBe("CANCELLED_BY_CUSTOMER");
    expect(result.cancelledByUserId).toBe(ADMIN_ID);
    const evt = vi.mocked(h.outbox.write).mock.calls[0]![1];
    expect((evt.payload as Record<string, unknown>).cancelledByRole).toBe("ADMIN");
  });

  it.each(["IN_PROGRESS", "COMPLETED", "EXPIRED"] as const satisfies BookingStatus[])(
    "admin still cannot cancel %s (state machine wins)",
    async (status) => {
      const h = buildHarness({ status });
      await expect(
        h.useCase.execute(
          { bookingId: BOOKING_ID, reason: "x" },
          { userId: ADMIN_ID, role: "ADMIN" },
        ),
      ).rejects.toBeInstanceOf(BookingNotCancellableError);
    },
  );
});
