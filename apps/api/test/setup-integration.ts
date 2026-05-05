import { execSync } from "node:child_process";
import path from "node:path";

import {
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

let postgres: StartedTestContainer | undefined;
let redis: StartedTestContainer | undefined;
let minio: StartedTestContainer | undefined;

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

  // MinIO for storage tests. Same image we run in dev compose.
  minio = await new GenericContainer("quay.io/minio/minio:RELEASE.2024-10-13T13-34-11Z")
    .withCommand(["server", "/data", "--console-address", ":9001"])
    .withEnvironment({
      MINIO_ROOT_USER: "minioadmin",
      MINIO_ROOT_PASSWORD: "minioadmin",
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
    .withStartupTimeout(60_000)
    .start();

  const minioPort = minio.getMappedPort(9000);
  const storageEndpoint = `http://localhost:${String(minioPort)}`;
  const storageBucket = "eventfleet-test-uploads";

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.LOG_LEVEL = "warn";
  // Auth env: deterministic dummies so AppModule's validateEnv passes during
  // integration runs. Real secrets live only in dev .env / prod secret store.
  // Length must satisfy the schema (>= 64 chars).
  process.env.JWT_ACCESS_SECRET ??= "0".repeat(64);
  process.env.JWT_REFRESH_SECRET ??= "1".repeat(64);
  process.env.JWT_ACCESS_TTL_SECONDS ??= "900";
  process.env.JWT_REFRESH_TTL_SECONDS ??= "2592000";
  process.env.OTP_CODE_TTL_SECONDS ??= "300";
  process.env.OTP_MAX_VERIFY_ATTEMPTS ??= "5";
  process.env.SMS_DRIVER ??= "mock";
  process.env.NETGSM_USERCODE ??= "DUMMY_TEST_USERCODE";
  process.env.NETGSM_PASSWORD ??= "DUMMY_TEST_PASSWORD";
  process.env.NETGSM_SENDER ??= "EVENTFLEET";
  process.env.NOTIFICATION_MAX_ATTEMPTS ??= "5";
  process.env.NOTIFICATION_BACKOFF_DELAY_MS ??= "2000";
  // PII hashing: deterministic dummy is fine for tests; real secret only in dev/prod.
  process.env.PII_HMAC_SECRET ??= "2".repeat(64);
  // Storage env: pointed at the test MinIO container. Bucket created below.
  process.env.STORAGE_PROVIDER ??= "minio";
  process.env.STORAGE_ENDPOINT = storageEndpoint;
  process.env.STORAGE_ACCESS_KEY_ID = "minioadmin";
  process.env.STORAGE_SECRET_ACCESS_KEY = "minioadmin";
  process.env.STORAGE_BUCKET = storageBucket;
  process.env.STORAGE_REGION ??= "us-east-1";
  process.env.STORAGE_FORCE_PATH_STYLE = "true";
  process.env.STORAGE_PUBLIC_URL = `${storageEndpoint}/${storageBucket}`;
  process.env.STORAGE_MAX_FILE_SIZE_BYTES ??= "15728640";
  // Pricing / distance — dummy Google key flips PricingModule to mock haversine.
  process.env.GOOGLE_MAPS_API_KEY ??= "AIzaSy_DUMMY_TEST_FIXED_KEY_FOR_INTEGRATION";
  process.env.GOOGLE_MAPS_RATE_LIMIT_PER_SECOND ??= "10";
  process.env.PRICE_QUOTE_TTL_SECONDS ??= "900";
  process.env.DISPATCH_MAX_RADIUS_KM ??= "25";
  process.env.DISPATCH_MIN_RATING ??= "4.0";
  process.env.DISPATCH_DISTANCE_WEIGHT ??= "0.7";
  process.env.DISPATCH_RATING_WEIGHT ??= "0.3";
  process.env.DISPATCH_MAX_ATTEMPTS ??= "3";
  process.env.DISPATCH_RETRY_COOLDOWN_MS ??= "60000";
  process.env.DISPATCH_WORKER_INTERVAL_MS ??= "30000";
  process.env.DISPATCH_LOCATION_FRESHNESS_SECONDS ??= "300";

  // Bootstrap the test bucket + open anonymous download (so publicUrl works
  // in tests just like dev does via mc).
  const s3 = new S3Client({
    endpoint: storageEndpoint,
    region: "us-east-1",
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
    forcePathStyle: true,
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: storageBucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: storageBucket }));
  }
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: storageBucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${storageBucket}/*`],
          },
        ],
      }),
    }),
  );
  s3.destroy();

  // Apply migrations against the freshly-started Postgres.
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  execSync(`pnpm prisma migrate deploy --schema prisma/schema.prisma`, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

export async function teardown(): Promise<void> {
  await Promise.allSettled([postgres?.stop(), redis?.stop(), minio?.stop()]);
}
