import type { ApiClient } from "./client";

/**
 * /users/me endpoints. Today only the push-token write lives here —
 * future profile reads/writes (displayName, locale) land here too
 * rather than carving a separate api/profile.ts.
 *
 * The push-token call is fire-and-forget from the AuthContext: a
 * NetworkError or 5xx during registration must NOT break the auth
 * flow. The caller wraps the call in try/catch and logs the failure.
 */
export function createUsersApi(client: ApiClient) {
  return {
    /**
     * PATCH /users/me/push-token. Pass `null` to clear the token (the
     * mobile foreground handler does this on logout — A4d-3 polish
     * deferred, lands later).
     */
    async updatePushToken(expoPushToken: string | null): Promise<void> {
      // The endpoint returns 204 No Content; the API client returns
      // undefined for that path, but TS only sees the generic. We
      // discard the typed result via `unknown` to keep the signature
      // honest (Promise<void>) without tripping no-invalid-void-type.
      await client.request<unknown>("/users/me/push-token", {
        method: "PATCH",
        body: { expoPushToken },
      });
    },
  };
}

export type UsersApi = ReturnType<typeof createUsersApi>;
