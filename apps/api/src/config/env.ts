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

  SMS_DRIVER: z.enum(["mock", "netgsm"]).default("mock"),

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
