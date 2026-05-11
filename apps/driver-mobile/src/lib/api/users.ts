import type { ApiClient } from "./client";

/**
 * /users/me endpoints for the driver app. Same shape as customer-mobile
 * — both apps share the backend `PATCH /users/me/push-token` endpoint
 * (the route is role-agnostic; the listener decides how to use the
 * stored token via channel routing).
 */
export function createUsersApi(client: ApiClient) {
  return {
    /** PATCH /users/me/push-token. Pass null to clear (logout). */
    async updatePushToken(expoPushToken: string | null): Promise<void> {
      await client.request<unknown>("/users/me/push-token", {
        method: "PATCH",
        body: { expoPushToken },
      });
    },
  };
}

export type UsersApi = ReturnType<typeof createUsersApi>;
