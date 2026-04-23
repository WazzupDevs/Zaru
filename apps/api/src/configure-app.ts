import { NestExpressApplication } from "@nestjs/platform-express";

const BODY_LIMIT = "1mb";

/**
 * Apply runtime configuration shared by main.ts (production bootstrap) and
 * the e2e test harness so behaviour matches across both.
 */
export function configureApp(app: NestExpressApplication): void {
  app.set("trust proxy", 1);
  app.useBodyParser("json", { limit: BODY_LIMIT });
  app.useBodyParser("urlencoded", { extended: true, limit: BODY_LIMIT });
  app.enableShutdownHooks();
}
