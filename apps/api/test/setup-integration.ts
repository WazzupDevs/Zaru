import { execSync } from "node:child_process";
import path from "node:path";

import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

let postgres: StartedTestContainer | undefined;
let redis: StartedTestContainer | undefined;

/**
 * Vitest globalSetup: spins up disposable Postgres (with PostGIS) + Redis
 * containers, applies Prisma migrations, and exposes connection strings via
 * env vars. Tests then load AppModule normally.
 */
export async function setup(): Promise<void> {
  postgres = await new GenericContainer("postgis/postgis:16-3.4")
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(60_000)
    .start();

  const pgPort = postgres.getMappedPort(5432);
  const databaseUrl = `postgresql://test:test@localhost:${String(pgPort)}/test?schema=public`;

  redis = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .withStartupTimeout(60_000)
    .start();

  const redisPort = redis.getMappedPort(6379);
  const redisUrl = `redis://localhost:${String(redisPort)}`;

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.LOG_LEVEL = "warn";

  // Apply migrations against the freshly-started Postgres.
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  execSync(`pnpm prisma migrate deploy --schema prisma/schema.prisma`, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

export async function teardown(): Promise<void> {
  await Promise.allSettled([postgres?.stop(), redis?.stop()]);
}
