import { afterEach, vi } from "vitest";

const secureStoreState = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
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

afterEach(() => {
  secureStoreState.clear();
  vi.clearAllMocks();
});
