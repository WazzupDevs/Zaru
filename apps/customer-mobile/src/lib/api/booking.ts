import { z } from "zod";

import {
  BookingResponseSchema,
  type BookingResponse,
  type BookingStatus,
} from "@event-fleet/shared-types";

import type { ApiClient } from "./client";

export type { BookingResponse, BookingStatus };

export interface ListMyBookingsQuery {
  status?: BookingStatus;
  cursor?: string;
  limit?: number;
}

export function createBookingApi(client: ApiClient) {
  return {
    confirm(quoteId: string): Promise<BookingResponse> {
      return client
        .request<unknown>("/bookings/confirm", {
          method: "POST",
          body: { quoteId },
          // Idempotency key keyed on the quote: replaying the confirm
          // request for the same quote (e.g., user double-taps "Onayla")
          // returns the same booking instead of creating two.
          headers: { "Idempotency-Key": `booking-confirm-${quoteId}` },
        })
        .then((data) => BookingResponseSchema.parse(data));
    },

    cancel(bookingId: string, reason: string): Promise<BookingResponse> {
      return client
        .request<unknown>(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
          method: "POST",
          body: { reason },
          // Cancel is keyed on (booking, reason, time-bucket) so the user
          // can re-cancel later if state allowed it back, but a true
          // double-tap within the same second hits the same key.
          headers: {
            "Idempotency-Key": `booking-cancel-${bookingId}-${String(Math.floor(Date.now() / 1000))}`,
          },
        })
        .then((data) => BookingResponseSchema.parse(data));
    },

    getById(id: string): Promise<BookingResponse> {
      return client
        .request<unknown>(`/bookings/${encodeURIComponent(id)}`, { method: "GET" })
        .then((data) => BookingResponseSchema.parse(data));
    },

    listMy(query: ListMyBookingsQuery = {}): Promise<BookingResponse[]> {
      const params = new URLSearchParams();
      if (query.status !== undefined) params.set("status", query.status);
      if (query.cursor !== undefined) params.set("cursor", query.cursor);
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      const qs = params.toString();
      const path = qs.length > 0 ? `/bookings/me?${qs}` : "/bookings/me";
      return client
        .request<unknown>(path, { method: "GET" })
        .then((data) => z.array(BookingResponseSchema).parse(data));
    },
  };
}

export type BookingApi = ReturnType<typeof createBookingApi>;
