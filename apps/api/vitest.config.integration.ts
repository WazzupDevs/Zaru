import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Integration suite: spins real Postgres + Redis via Testcontainers in the
 * globalSetup, then runs *.e2e-spec.ts and *.integration-spec.ts files
 * under test/. Run with `pnpm test:integration`.
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
    include: ["test/**/*.e2e-spec.ts", "test/**/*.integration-spec.ts"],
    globalSetup: ["./test/setup-integration.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Single-threaded: containers + migrations are stateful per run.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // Run integration spec files sequentially. Each spec boots its own
    // AppModule and that module starts background workers (outbox drain,
    // booking expiry, dispatch, idempotency cleanup). Two spec files
    // boot in parallel would compete for AccessExclusiveLock during the
    // TRUNCATE in beforeEach and deadlock on Postgres.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
