import { createAuthApi } from "./auth";
import { createBookingApi } from "./booking";
import { createCatalogApi } from "./catalog";
import { createApiClient, type ApiClient } from "./client";
import { createPricingApi } from "./pricing";
import { clearSession, getTokens, setTokens } from "../storage/secure-token-storage";

/**
 * App-wide API client singletons. One ApiClient is shared across every
 * domain wrapper so the single-flight refresh queue de-dups across
 * concurrent requests no matter which module triggered them. Module
 * load is side-effect-free (the constructor is a closure factory; no
 * network or SecureStore touch happens until `.request()`).
 */
const apiClient: ApiClient = createApiClient({
  hooks: { getTokens, setTokens, clearTokens: clearSession },
});

export const authApi = createAuthApi(apiClient);
export const catalogApi = createCatalogApi(apiClient);
export const pricingApi = createPricingApi(apiClient);
export const bookingApi = createBookingApi(apiClient);

export { apiClient };
