import path from "node:path";

import { defineConfig } from "vitest/config";

// Vitest scope on mobile is **pure logic only** — token storage wrapper,
// API client, format helpers, auth reducers. Anything that imports
// react-native or renders a component goes through Jest + jest-expo
// (deferred to A4d-3 polish). Keeping the surface narrow lets vitest
// stay fast (no native module shims) and keeps the `pnpm test` contract
// the same as every other workspace.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
