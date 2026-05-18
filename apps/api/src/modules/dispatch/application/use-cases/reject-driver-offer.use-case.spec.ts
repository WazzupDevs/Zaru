import { beforeEach, describe, expect, it, vi } from "vitest";

import { RejectDriverOfferUseCase } from "./reject-driver-offer.use-case";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";
import { ValidationError } from "../../../../common/errors/domain-error";
import {
  ConcurrentOfferModificationError,
  OfferExpiredError,
  OfferForbiddenError,
  OfferNotFoundError,
  OfferStateTransitionError,
} from "../../domain/errors/dispatch-errors";
import { DISPATCH_EVENT_TYPES } from "../../domain/events/dispatch-events";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type {
  DriverProfileRecord,
  DriverProfileRepositoryPort,
} from "../../../supply/application/ports/driver-profile.repository.port";
import type { DriverOfferEntity } from "../../domain/driver-offer-types";
import type { DriverDispatchCooldownRepositoryPort } from "../ports/driver-dispatch-cooldown.repository.port";
import type { DriverOfferRepositoryPort } from "../ports/driver-offer.repository.port";

const NOW = new Date("2026-08-15T10:00:00.000Z");
const OFFER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_USER_ID = "44444444-4444-4444-8444-444444444444";
const VEHICLE_ID = "55555555-5555-4555-8555-555555555555";
const COOLDOWN_MS = 5 * 60 * 1000;

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
  useCase: RejectDriverOfferUseCase;
  offer: DriverOfferEntity;
  offerRepo: DriverOfferRepositoryPort;
  cooldownRepo: DriverDispatchCooldownRepositoryPort;
  outbox: OutboxWriterPort;
}

function buildHarness(
  overrides: {
    offer?: Partial<DriverOfferEntity>;
    driver?: DriverProfileRecord | null;
  } = {},
): Harness {
  const offer = buildOffer(overrides.offer);

  const offerRepo: DriverOfferRepositoryPort = {
    findById: vi.fn(async (_tx, id) => (id === offer.id ? offer : null)),
    create: vi.fn(),
    transitionStatus: vi.fn(async (_tx, input) => {
      if (input.fromVersion !== offer.version) return null;
      return {
        ...offer,
        status: input.toStatus,
        version: offer.version + 1,
        ...(input.fields?.rejectedAt ? { rejectedAt: input.fields.rejectedAt } : {}),
        ...(input.fields?.expiredAt ? { expiredAt: input.fields.expiredAt } : {}),
        ...(input.fields?.rejectReason ? { rejectReason: input.fields.rejectReason } : {}),
        ...(input.fields && "rejectNote" in input.fields
          ? { rejectNote: input.fields.rejectNote ?? null }
          : {}),
      };
    }),
    findActiveByDriverId: vi.fn(),
    findActiveByBookingId: vi.fn(),
    findPriorDriverIdsForBooking: vi.fn(),
    findExpiredPending: vi.fn(),
    list: vi.fn(),
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

  const cooldownRepo: DriverDispatchCooldownRepositoryPort = {
    upsert: vi.fn(async (_tx, input) => ({
      id: "cd-1",
      driverProfileId: input.driverProfileId,
      bookingId: input.bookingId,
      expiresAt: input.expiresAt,
      createdAt: NOW,
    })),
    findActive: vi.fn(),
    deleteExpired: vi.fn(),
  };

  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };

  const useCase = new RejectDriverOfferUseCase(
    offerRepo,
    driverRepo,
    cooldownRepo,
    new FakeTxRunner(),
    outbox,
    new FrozenClock(NOW),
  );

  return { useCase, offer, offerRepo, cooldownRepo, outbox };
}

describe("RejectDriverOfferUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: PENDING + valid reason → REJECTED + cooldown upsert + outbox", async () => {
    const h = buildHarness();

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
      reason: "TOO_FAR",
      note: "outside my zone",
    });

    expect(result.status).toBe("REJECTED");

    expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        offerId: OFFER_ID,
        fromVersion: 0,
        toStatus: "REJECTED",
        fields: expect.objectContaining({
          rejectedAt: NOW,
          rejectReason: "TOO_FAR",
          rejectNote: "outside my zone",
        }),
      }),
    );

    expect(h.cooldownRepo.upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        driverProfileId: DRIVER_PROFILE_ID,
        bookingId: BOOKING_ID,
        expiresAt: new Date(NOW.getTime() + COOLDOWN_MS),
      }),
    );

    expect(h.outbox.write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: DISPATCH_EVENT_TYPES.DRIVER_OFFER_REJECTED,
        aggregateType: "Booking",
        aggregateId: BOOKING_ID,
        payload: expect.objectContaining({
          offerId: OFFER_ID,
          bookingId: BOOKING_ID,
          driverProfileId: DRIVER_PROFILE_ID,
          reason: "TOO_FAR",
        }),
      }),
    );
  });

  it("accepts a reject without a note (note is optional)", async () => {
    const h = buildHarness();

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
      reason: "VEHICLE_UNAVAILABLE",
    });

    expect(result.status).toBe("REJECTED");
    expect(h.offerRepo.transitionStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fields: expect.objectContaining({
          rejectReason: "VEHICLE_UNAVAILABLE",
          rejectNote: null,
        }),
      }),
    );
  });

  it("idempotent re-reject (already REJECTED) returns offer without further writes", async () => {
    const h = buildHarness({
      offer: {
        status: "REJECTED",
        rejectedAt: new Date("2026-08-15T09:59:00.000Z"),
        rejectReason: "TOO_FAR",
      },
    });

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
      reason: "TIME_CONFLICT",
    });

    expect(result.status).toBe("REJECTED");
    expect(h.offerRepo.transitionStatus).not.toHaveBeenCalled();
    expect(h.cooldownRepo.upsert).not.toHaveBeenCalled();
    expect(h.outbox.write).not.toHaveBeenCalled();
  });

  it("throws OfferNotFoundError when the offer id does not exist", async () => {
    const h = buildHarness();

    await expect(
      h.useCase.execute({
        offerId: "00000000-0000-4000-8000-000000000000",
        driverUserId: DRIVER_USER_ID,
        reason: "OTHER",
      }),
    ).rejects.toBeInstanceOf(OfferNotFoundError);
  });

  it("throws OfferForbiddenError when the driver does not own the offer", async () => {
    const h = buildHarness({
      driver: {
        ...driverProfile(),
        id: "99999999-9999-4999-8999-999999999999",
      },
    });

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        reason: "TOO_FAR",
      }),
    ).rejects.toBeInstanceOf(OfferForbiddenError);

    expect(h.cooldownRepo.upsert).not.toHaveBeenCalled();
  });

  it("auto-expires + throws OfferExpiredError when now > expiresAt", async () => {
    const h = buildHarness({
      offer: { expiresAt: new Date("2026-08-15T09:58:00.000Z") },
    });

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        reason: "TIME_CONFLICT",
      }),
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
    expect(h.cooldownRepo.upsert).not.toHaveBeenCalled();
  });

  it("rejects when offer is in ACCEPTED (state machine guard)", async () => {
    const h = buildHarness({
      offer: { status: "ACCEPTED", acceptedAt: new Date("2026-08-15T09:55:00.000Z") },
    });

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        reason: "TOO_FAR",
      }),
    ).rejects.toBeInstanceOf(OfferStateTransitionError);

    expect(h.cooldownRepo.upsert).not.toHaveBeenCalled();
  });

  it("throws ValidationError when note exceeds 500 chars", async () => {
    const h = buildHarness();

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        reason: "OTHER",
        note: "x".repeat(501),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(h.offerRepo.transitionStatus).not.toHaveBeenCalled();
    expect(h.cooldownRepo.upsert).not.toHaveBeenCalled();
  });

  it("accepts note exactly at 500 chars", async () => {
    const h = buildHarness();

    const result = await h.useCase.execute({
      offerId: OFFER_ID,
      driverUserId: DRIVER_USER_ID,
      reason: "OTHER",
      note: "x".repeat(500),
    });

    expect(result.status).toBe("REJECTED");
  });

  it("throws ConcurrentOfferModificationError when the version race is lost on REJECTED", async () => {
    const h = buildHarness();
    (h.offerRepo.transitionStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(
      h.useCase.execute({
        offerId: OFFER_ID,
        driverUserId: DRIVER_USER_ID,
        reason: "TOO_FAR",
      }),
    ).rejects.toBeInstanceOf(ConcurrentOfferModificationError);

    expect(h.cooldownRepo.upsert).not.toHaveBeenCalled();
  });
});
