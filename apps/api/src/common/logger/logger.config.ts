import { IncomingMessage, ServerResponse } from "node:http";

import { ConfigService } from "@nestjs/config";
import { Params } from "nestjs-pino";
import { Options as PinoHttpOptions } from "pino-http";
import { ulid } from "ulid";

import type { Env } from "../../config/env";

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "req.body.otp",
  "req.body.password",
  "req.body.phoneE164",
  "req.body.tokenHash",
  "req.body.refreshToken",
  "req.body.code",
  // PII (A3b): TCKN and IBAN never appear in plaintext anywhere — redact body
  // and any nested object path to protect against accidental console.log /
  // logger.debug of a domain entity that hasn't sanitized yet.
  "req.body.nationalId",
  "req.body.iban",
  "*.phoneE164",
  "*.tokenHash",
  "*.refreshToken",
  "*.password",
  "*.otp",
  "*.codeHash",
  "*.nationalId",
  "*.nationalIdHash",
  "*.iban",
  "*.ibanHash",
  // Notifications (A4e-1): plaintext recipient + rendered body live on the
  // notifications row (provider needs them clear); redact in any logger
  // payload that captures them.
  "*.recipientPhone",
  "*.renderedBody",
  // Push tokens (A4e-3): an Expo push token is a write capability — anyone
  // with it can send a notification to that device. Redact in any logger
  // payload (User row, Notification row, controller body, audit dump).
  "*.expoPushToken",
  "*.recipientPushToken",
  "req.body.expoPushToken",
];

const SERVICE_NAME = "event-fleet-api";
const SERVICE_VERSION = "0.0.0";

/**
 * Build pino params from validated env. Pretty in dev, JSON in prod, silent in test.
 */
export function buildLoggerConfig(config: ConfigService<Env, true>): Params {
  const env = config.get("NODE_ENV", { infer: true });
  const level = config.get("LOG_LEVEL", { infer: true });

  const pinoHttp: PinoHttpOptions = {
    level: env === "test" ? "silent" : level,
    base: { service: SERVICE_NAME, env, version: SERVICE_VERSION },
    redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const headerId = req.headers["x-request-id"];
      const id = typeof headerId === "string" && headerId.length > 0 ? headerId : ulid();
      res.setHeader("x-request-id", id);
      return id;
    },
    customLogLevel: (_req, res, err) => {
      if (err) return "error";
      const status = res.statusCode;
      if (status >= 500) return "error";
      if (status >= 400) return "warn";
      return "info";
    },
  };

  if (env === "development") {
    pinoHttp.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: false,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    };
  }

  return { pinoHttp };
}
