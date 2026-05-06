// Vitest global setup — mocks the Expo native modules that vitest can't
// load (they ship CJS bindings to native code that only exist inside the
// Expo Go runtime / EAS-built binary). Each test file extends or resets
// these via vi.mocked(...).

import { afterEach, vi } from "vitest";

const secureStoreState = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  // Mirror the subset of the API the storage wrapper uses. Real Expo
  // SecureStore returns null when a key is missing, throws on write
  // failure (e.g., keychain locked) — the mock returns null + happy-path
  // success. Failure cases are simulated per-test by re-mocking.
  getItemAsync: vi.fn(
    (key: string): Promise<string | null> => Promise.resolve(secureStoreState.get(key) ?? null),
  ),
  setItemAsync: vi.fn((key: string, value: string): Promise<void> => {
    secureStoreState.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string): Promise<void> => {
    secureStoreState.delete(key);
    return Promise.resolve();
  }),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: "http://localhost:3000",
      },
    },
  },
}));

// Reset between tests so a leaked write from one spec doesn't bleed into
// the next.
afterEach(() => {
  secureStoreState.clear();
  vi.clearAllMocks();
});
