import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // --- Authentication (A2c) ---
  JWT_ACCESS_SECRET: z.string().min(64, "JWT_ACCESS_SECRET must be >= 64 chars (32 bytes hex)"),
  JWT_REFRESH_SECRET: z.string().min(64, "JWT_REFRESH_SECRET must be >= 64 chars (32 bytes hex)"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  OTP_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Legacy A2c knob — still respected for forced overrides, but the
  // primary selection happens via NETGSM_USERCODE dummy-prefix pattern
  // (see notifications.module.ts factory). ADR 0021.
  SMS_DRIVER: z.enum(["mock", "netgsm"]).default("mock"),

  // --- Netgsm SMS provider (A4e-1) — ADR 0021 ---
  // A usercode starting with `DUMMY_` flips the factory to MockSmsSender
  // (dev/test/CI). Replace with a real Netgsm panel usercode in prod.
  NETGSM_USERCODE: z.string().min(5).default("DUMMY_REPLACE_WITH_REAL_USERCODE"),
  NETGSM_PASSWORD: z.string().min(5).default("DUMMY_REPLACE_WITH_REAL_PASSWORD"),
  // 1–11 chars, A–Z + 0–9. Netgsm panel verifies this header.
  NETGSM_SENDER: z
    .string()
    .regex(/^[A-Z0-9]{1,11}$/)
    .default("EVENTFLEET"),
  // Retry policy (ADR 0022). 5 attempts × exponential backoff = ~13 min
  // total before dead-lettering.
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  NOTIFICATION_BACKOFF_DELAY_MS: z.coerce.number().int().positive().default(2_000),

  SENTRY_DSN: z.string().url().optional(),

  // --- PII hashing (A3b) ---
  // HMAC-SHA256 secret for deterministic TCKN hashing. Admin search needs
  // determinism; rotation is a multi-step migration (dual-write window).
  // Generate: `openssl rand -hex 32`. Min 64 hex chars.
  PII_HMAC_SECRET: z.string().min(64, "PII_HMAC_SECRET must be >= 64 chars (32 bytes hex)"),

  // --- Object storage (A3b) ---
  // S3-compatible. Dev = MinIO (docker compose), prod = Cloudflare R2.
  // Same SDK (@aws-sdk/client-s3), differs only in endpoint + credentials.
  STORAGE_PROVIDER: z.enum(["minio", "r2"]).default("minio"),
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  // Public URL prefix used to compose post-upload object URLs.
  STORAGE_PUBLIC_URL: z.string().url(),
  // Hard upper bound enforced via presigned PUT Content-Length signing.
  // Client cannot bypass — S3 reject the upload.
  STORAGE_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(15728640),

  // --- Bootstrap admin (A3c) ---
  // Dev/test only — production seed run skips this and warns. Use the
  // `pnpm api:promote-admin <phone>` CLI in production. ADR 0015.
  BOOTSTRAP_ADMIN_PHONE: z
    .string()
    .regex(/^\+90(5)\d{9}$/, "BOOTSTRAP_ADMIN_PHONE must be a TR mobile in E.164 format")
    .optional(),

  // --- Pricing / Distance (A4a) ---
  // Google Maps Distance Matrix API key. Dummy values starting with
  // `AIzaSy_DUMMY` switch the module to MockDistanceCalculator (haversine)
  // for local dev and CI. ADR 0018.
  GOOGLE_MAPS_API_KEY: z.string().min(20).default("AIzaSy_DUMMY_REPLACE_WITH_REAL_KEY"),
  GOOGLE_MAPS_RATE_LIMIT_PER_SECOND: z.coerce.number().int().positive().default(10),
  // Quote TTL (15 minutes by default). ADR 0017.
  PRICE_QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // --- Dispatch / Driver matching (A4c) — ADR 0020 ---
  // Driver search radius. PostGIS ST_DWithin works in metres internally;
  // we configure km here for ergonomics.
  DISPATCH_MAX_RADIUS_KM: z.coerce.number().positive().default(25),
  // Drivers below this rating are filtered out before scoring. New drivers
  // default to ratingAverage = 5.0 so they qualify until they rack up reviews.
  DISPATCH_MIN_RATING: z.coerce.number().min(0).max(5).default(4.0),
  // Score = distanceWeight * (1 - dist/maxRadius) + ratingWeight * (rating/5).
  // Weights should sum to 1.0; we tolerate non-1.0 sums for experimentation.
  DISPATCH_DISTANCE_WEIGHT: z.coerce.number().min(0).max(1).default(0.7),
  DISPATCH_RATING_WEIGHT: z.coerce.number().min(0).max(1).default(0.3),
  // Max attempts before a booking is escalated to manual-review (worker
  // emits dispatch.DispatchFailed with requiresManualReview=true).
  DISPATCH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Cooldown between consecutive worker attempts on the same booking.
  DISPATCH_RETRY_COOLDOWN_MS: z.coerce.number().int().positive().default(60_000),
  // Worker tick — every 30 s by default.
  DISPATCH_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  // Driver location is considered stale after this many seconds (matcher
  // filters drivers whose lastLocationUpdate is older).
  DISPATCH_LOCATION_FRESHNESS_SECONDS: z.coerce.number().int().positive().default(300),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validator for `@nestjs/config`'s `validate` option.
 * Fail-fast: invalid env aborts startup with a readable error.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
