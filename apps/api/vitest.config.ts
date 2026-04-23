import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Unit-only config (default `pnpm test`). Picks up *.spec.ts under src/
 * but skips the integration suite under test/. NestJS DI requires SWC's
 * decorator metadata emission (see ADR 0007).
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        target: "es2022",
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "**/*.spec.ts",
        "**/*.e2e-spec.ts",
        "**/dist/**",
        "**/node_modules/**",
        "src/main.ts",
      ],
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
