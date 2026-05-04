import { describe, expect, it, vi } from "vitest";

import { PriceQuoteCleanupService } from "./price-quote-cleanup.service";
import { FrozenClock } from "../../../../../test/fakes/frozen-clock";

import type { OutboxWriterPort } from "../../../../common/persistence/outbox-writer.port";
import type { TxClient } from "../../../../common/persistence/tx-client";
import type { TxRunnerPort } from "../../../../common/persistence/tx-runner.port";
import type {
  PriceQuoteEntity,
  PriceQuoteRepositoryPort,
} from "../../application/ports/price-quote.repository.port";

const NOW = new Date("2026-08-15T10:00:00.000Z");

class FakeTxRunner implements TxRunnerPort {
  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn({} as TxClient);
  }
}

function buildQuote(id: string): PriceQuoteEntity {
  return {
    id,
    requestedByUserId: "user",
    vehicleTypeId: "vt",
    categoryId: "cat",
    pickupLat: "0",
    pickupLng: "0",
    pickupAddress: "",
    dropoffLat: "0",
    dropoffLng: "0",
    dropoffAddress: "",
    distanceKm: "0.00",
    durationMinutes: 0,
    eventStartAt: NOW,
    eventEndAt: NOW,
    durationHours: "0.00",
    breakdown: {} as never,
    totalAmount: "0.00",
    currency: "TRY",
    selectedAddons: [],
    status: "EXPIRED",
    expiresAt: new Date(NOW.getTime() - 60_000),
    consumedAt: null,
    consumedByBookingId: null,
    createdAt: new Date(NOW.getTime() - 16 * 60_000),
  };
}

function buildHarness(rows: PriceQuoteEntity[]) {
  const repo: PriceQuoteRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(),
    consumeQuote: vi.fn(),
    expireOlderThan: vi.fn(async () => rows),
  };
  const outbox: OutboxWriterPort = { write: vi.fn(async () => undefined) };
  const clock = new FrozenClock(NOW);
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  const svc = new PriceQuoteCleanupService(
    repo,
    new FakeTxRunner(),
    outbox,
    clock,
    logger as never,
  );
  return { svc, repo, outbox };
}

describe("PriceQuoteCleanupService.sweep", () => {
  it("calls expireOlderThan(now) and emits one event per expired quote", async () => {
    const h = buildHarness([buildQuote("q1"), buildQuote("q2")]);
    const result = await h.svc.sweep();

    expect(result.expired).toBe(2);
    expect(h.repo.expireOlderThan).toHaveBeenCalledOnce();
    expect(vi.mocked(h.repo.expireOlderThan).mock.calls[0]![1]).toEqual(NOW);

    expect(h.outbox.write).toHaveBeenCalledTimes(2);
    const evtTypes = vi.mocked(h.outbox.write).mock.calls.map((c) => c[1].eventType);
    expect(evtTypes).toEqual(["pricing.PriceQuoteExpired", "pricing.PriceQuoteExpired"]);
  });

  it("returns 0 and writes nothing when no rows expire", async () => {
    const h = buildHarness([]);
    const result = await h.svc.sweep();
    expect(result.expired).toBe(0);
    expect(h.outbox.write).not.toHaveBeenCalled();
  });
});
