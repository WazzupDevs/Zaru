import path from "node:path";

import { defineConfig } from "vitest/config";

// Vitest scope on driver mobile is pure logic only — same split as
// customer mobile (storage, API client, format helpers, bootstrap).
// Anything that imports react-native lives in Jest (deferred to A4f-3
// when the screens stabilise).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // A4f-1a ships scaffold + auth flow only — unit tests for storage,
    // bootstrap, and the role guard land alongside the online toggle in
    // A4f-1b. Without this flag, vitest exits 1 on "no test files
    // found" and CI fails on the empty suite.
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
