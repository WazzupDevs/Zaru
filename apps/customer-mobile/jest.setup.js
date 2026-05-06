/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Jest setup — runs before each test file. Mocks the Expo native modules
 * that the jest-expo preset doesn't already cover, and silences the
 * console.warn calls that come from RN's StyleSheet during snapshots.
 */

jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    setItemAsync: jest.fn((k, v) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((k) => Promise.resolve(store.get(k) ?? null)),
    deleteItemAsync: jest.fn((k) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
});

jest.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: "http://localhost:3000",
      },
    },
  },
}));

// Expo Router's hooks throw when called outside the router context. We
// stub the surface our tests touch (router.push, router.back, useLocalSearchParams)
// so component tests don't need a full <Stack/> wrapper.
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect: jest.fn(),
  Redirect: () => null,
  Stack: { Screen: () => null },
  Tabs: { Screen: () => null },
  Slot: () => null,
}));

// react-native-safe-area-context's provider needs an inset frame; mock
// useSafeAreaInsets to a zero frame so SafeAreaView renders flat.
jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaView: ({ children }) => children,
    SafeAreaProvider: ({ children }) => children,
    useSafeAreaInsets: () => inset,
  };
});
