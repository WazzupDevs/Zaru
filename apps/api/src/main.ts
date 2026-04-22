import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";

const BODY_LIMIT = "1mb";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.set("trust proxy", 1);
  app.useBodyParser("json", { limit: BODY_LIMIT });
  app.useBodyParser("urlencoded", { extended: true, limit: BODY_LIMIT });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`event-fleet-api listening on :${String(port)}`, "Bootstrap");
}

void bootstrap();
