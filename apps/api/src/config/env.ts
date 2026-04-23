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
