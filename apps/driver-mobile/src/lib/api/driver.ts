import { z } from "zod";

import type { ApiClient } from "./client";

/**
 * Driver-facing dispatch endpoints. The brief's `/drivers/me/*` routes
 * don't exist on the backend — the real path is
 * `/dispatch/drivers/:driverProfileId/*`. The driver profile id flows
 * from the auth response (AuthUserSummary.driverProfileId, A4f-1b
 * controller enrichment) through every call here.
 *
 * The use case behind each endpoint enforces
 * `actor.userId === driverProfile.userId`, so a malicious id in the
 * path doesn't let a driver mutate someone else's profile.
 */

export const DriverProfileSnapshotSchema = z.object({
  id: z.string(),
  isOnline: z.boolean(),
  // Many driver-facing fields land here as the screen evolves; for
  // A4f-1b the home screen reads only isOnline + the stats below.
  // Optional so the backend can ship without breaking older clients.
  ratingAverage: z.string().optional(),
  totalCompletedBookings: z.number().int().optional(),
  lastLocationUpdatedAt: z.string().nullable().optional(),
});
export type DriverProfileSnapshot = z.infer<typeof DriverProfileSnapshotSchema>;

export interface UpdateLocationInput {
  lat: number;
  lng: number;
}

export function createDriverApi(client: ApiClient) {
  return {
    setOnlineStatus(driverProfileId: string, isOnline: boolean): Promise<void> {
      return client
        .request<unknown>(`/dispatch/drivers/${driverProfileId}/online-status`, {
          method: "PATCH",
          body: { isOnline },
          headers: {
            // Idempotency-Key: same driver flipping back-and-forth in a
            // 5s window resolves to the same final state. Backend's
            // IdempotencyInterceptor already requires the header for
            // this route.
            "Idempotency-Key": `driver-online-${driverProfileId}-${String(isOnline)}-${String(
              Math.floor(Date.now() / 5000),
            )}`,
          },
        })
        .then(() => undefined);
    },

    updateLocation(driverProfileId: string, input: UpdateLocationInput): Promise<void> {
      return client
        .request<unknown>(`/dispatch/drivers/${driverProfileId}/location`, {
          method: "PATCH",
          body: input,
        })
        .then(() => undefined);
    },

    /**
     * The backend doesn't expose a public GET — the driver profile is
     * read by the dispatch worker, not the driver. For A4f-1b we cache
     * `isOnline` locally (login = false; toggle flips). Wiring a real
     * GET endpoint lands in A4f-2 alongside the dispatch offer screen.
     */
    initialSnapshot(): DriverProfileSnapshot {
      return { id: "", isOnline: false };
    },
  };
}

export type DriverApi = ReturnType<typeof createDriverApi>;
