/**
 * Jest config — component test runner. Pure logic stays on vitest
 * (faster, no native module shims needed). Jest handles anything that
 * imports react-native because it needs the jest-expo preset to mock
 * the native modules + the babel transform pipeline.
 *
 * `@testing-library/react-native` 12+ ships built-in matchers
 * (toBeOnTheScreen / toHaveTextContent / etc) so we don't load
 * jest-native's extend-expect — that lib is on its way out.
 *
 * `transformIgnorePatterns` whitelists the RN/Expo/NativeWind packages
 * that ship untranspiled ESM in node_modules so Jest runs them through
 * babel-jest. The default ignores everything in node_modules. We have
 * two patterns because pnpm puts packages under .pnpm/<scoped+name@v>/
 * — a single "starts with node_modules/<pkg>" lookahead misses the
 * .pnpm/ prefix.
 *
 * `moduleNameMapper.react` overrides the tsconfig paths redirect that
 * sends `react` → `./node_modules/@types/react`. That mapping exists
 * for TypeScript's @types resolution; if it leaks into Jest's runtime
 * resolver it tries to load the types directory as a real module and
 * crashes ("Could not locate module react mapped as ...").
 */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/**/__tests__/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: [
    "node_modules/.pnpm/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?|@expo-google-fonts|react-navigation|@react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|nativewind|lucide-react-native))",
    "node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|lucide-react-native))",
  ],
  moduleNameMapper: {
    // Cancel the tsconfig paths react redirect for Jest's runtime resolver.
    "^react$": "<rootDir>/node_modules/react",
    "^react/(.*)$": "<rootDir>/node_modules/react/$1",
    "^@/(.*)$": "<rootDir>/$1",
  },
};
