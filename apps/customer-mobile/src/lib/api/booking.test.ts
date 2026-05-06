import { describe, expect, it, vi } from "vitest";

import { createBookingApi } from "./booking";
import { createApiClient } from "./client";

function clientWithMockFetch(fetchImpl: ReturnType<typeof vi.fn>) {
  return createApiClient({
    baseUrl: "http://api.test",
    fetchImpl,
    hooks: {
      getTokens: vi.fn(() =>
        Promise.resolve({
          accessToken: "access",
          refreshToken: "refresh",
          accessTokenExpiresAt: "2026-05-06T13:00:00.000Z",
          refreshTokenExpiresAt: "2026-06-05T12:45:00.000Z",
        }),
      ),
      setTokens: vi.fn(() => Promise.resolve()),
      clearTokens: vi.fn(() => Promise.resolve()),
    },
  });
}

const sampleBooking = {
  id: "33333333-3333-3333-3333-333333333333",
  customerId: "11111111-1111-1111-1111-111111111111",
  priceQuoteId: "22222222-2222-2222-2222-222222222222",
  status: "CONFIRMED",
  vehicleTypeId: "44444444-4444-4444-4444-444444444444",
  categoryId: "55555555-5555-5555-5555-555555555555",
  pickupAddress: "Sultanahmet, İstanbul",
  dropoffAddress: "Beşiktaş, İstanbul",
  eventStartAt: "2026-08-15T14:00:00.000Z",
  eventEndAt: "2026-08-15T22:00:00.000Z",
  totalAmount: "6877.00",
  currency: "TRY",
  confirmedAt: "2026-05-06T12:30:00.000Z",
  driverAssignedAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  expiredAt: null,
  cancellationReason: null,
  driverId: null,
  vehicleId: null,
  version: 1,
  createdAt: "2026-05-06T12:30:00.000Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("bookingApi", () => {
  it("confirm sends an Idempotency-Key keyed on the quote id", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, sampleBooking));
    const booking = createBookingApi(clientWithMockFetch(fetchImpl));

    await booking.confirm("22222222-2222-2222-2222-222222222222");

    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error("expected one fetch call");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Idempotency-Key": "booking-confirm-22222222-2222-2222-2222-222222222222",
    });
    // Confirms the request body carries the quoteId — server uses it to
    // consume the quote and create the booking in one transaction.
    expect(init.body).toBe(JSON.stringify({ quoteId: "22222222-2222-2222-2222-222222222222" }));
  });

  it("cancel sends an Idempotency-Key bucketed by second", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { ...sampleBooking, status: "CANCELLED_BY_CUSTOMER" }),
      );
    const booking = createBookingApi(clientWithMockFetch(fetchImpl));

    await booking.cancel("33333333-3333-3333-3333-333333333333", "test reason");

    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error("expected one fetch call");
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toMatch(
      /^booking-cancel-33333333-3333-3333-3333-333333333333-\d+$/,
    );
    expect(init.body).toBe(JSON.stringify({ reason: "test reason" }));
  });

  it("listMy serialises status + cursor + limit query params", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, [sampleBooking]));
    const booking = createBookingApi(clientWithMockFetch(fetchImpl));

    await booking.listMy({
      status: "CONFIRMED",
      cursor: "11111111-1111-1111-1111-111111111111",
      limit: 25,
    });

    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error("expected one fetch call");
    expect(call[0]).toBe(
      "http://api.test/bookings/me?status=CONFIRMED&cursor=11111111-1111-1111-1111-111111111111&limit=25",
    );
  });

  it("listMy with no opts hits the bare /bookings/me path", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, []));
    const booking = createBookingApi(clientWithMockFetch(fetchImpl));

    await booking.listMy();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://api.test/bookings/me");
  });

  it("rejects when API returns a status not in the BookingStatus enum (drift)", async () => {
    const broken = { ...sampleBooking, status: "UNKNOWN_STATUS" };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, broken));
    const booking = createBookingApi(clientWithMockFetch(fetchImpl));

    await expect(booking.getById(sampleBooking.id)).rejects.toThrow();
  });
});
