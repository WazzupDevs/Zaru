import { createApiClient, type ApiClient } from "./client";
import { createDriverAuthApi } from "./driver-auth";
import { clearSession, getTokens, setTokens } from "../storage/secure-token-storage";

/**
 * App-wide API client singleton. One ApiClient is built at module load;
 * the constructor is a closure factory (no network or SecureStore touch
 * happens until `.request()` is invoked). All domain wrappers thread
 * this same client so the single-flight refresh queue de-dups across
 * concurrent requests no matter which screen kicked them off.
 */
const apiClient: ApiClient = createApiClient({
  hooks: { getTokens, setTokens, clearTokens: clearSession },
});

export const driverAuthApi = createDriverAuthApi(apiClient);
export { apiClient };
