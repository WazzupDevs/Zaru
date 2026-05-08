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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
