/**
 * Lightweight structured logger for the mobile app.
 *
 * Two responsibilities the bare console can't satisfy:
 *
 *   1. PII redaction — phone numbers, tokens, recipient identifiers
 *      should never land in plaintext in dev consoles or in whatever
 *      error-tracking pipeline we attach later (Sentry / Better Stack
 *      in Faz 3+). The redactor masks the last 4 chars of any field
 *      whose key matches /phone|recipient|password|token|secret/i.
 *
 *   2. Production debug suppression — calls to Logger.debug are no-ops
 *      when __DEV__ is false. Keeps verbose tracing out of production
 *      JS bundles' runtime path even before any tracker is wired.
 *
 * The wrapper is intentionally thin: no transport, no batching, no
 * remote sink. When we add an error tracker we extend `log()` to fan
 * out; the call sites stay unchanged.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

// Global injected by Metro at build time. Tests can shim it via
// `(globalThis as any).__DEV__ = false` before importing the logger.
declare const __DEV__: boolean;

function isDevEnv(): boolean {
  return typeof __DEV__ === "boolean" ? __DEV__ : true;
}

const PII_KEY_PATTERN = /phone|recipient|password|token|secret/i;

export function redactPii(meta: LogMeta): LogMeta {
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (PII_KEY_PATTERN.test(key) && typeof value === "string" && value.length > 0) {
      out[key] = value.length > 4 ? `${value.slice(0, -4)}****` : "****";
    } else {
      out[key] = value;
    }
  }
  return out;
}

interface LogSink {
  debug: (message?: unknown, ...optional: unknown[]) => void;
  info: (message?: unknown, ...optional: unknown[]) => void;
  warn: (message?: unknown, ...optional: unknown[]) => void;
  error: (message?: unknown, ...optional: unknown[]) => void;
}

let sink: LogSink = console;

/**
 * Test seam — swap the underlying console for a spy. Production never
 * calls this; only the unit test does to capture calls.
 */
export function __setLogSink(custom: LogSink): () => void {
  const prev = sink;
  sink = custom;
  return () => {
    sink = prev;
  };
}

function log(level: LogLevel, event: string, meta?: LogMeta): void {
  if (level === "debug" && !isDevEnv()) return;

  const prefix = `[${level.toUpperCase()}] ${event}`;
  const safeMeta = meta ? redactPii(meta) : undefined;

  const fn =
    level === "error"
      ? sink.error
      : level === "warn"
        ? sink.warn
        : level === "info"
          ? sink.info
          : sink.debug;

  if (safeMeta && Object.keys(safeMeta).length > 0) {
    fn(prefix, safeMeta);
  } else {
    fn(prefix);
  }
}

export const Logger = {
  debug: (event: string, meta?: LogMeta) => {
    log("debug", event, meta);
  },
  info: (event: string, meta?: LogMeta) => {
    log("info", event, meta);
  },
  warn: (event: string, meta?: LogMeta) => {
    log("warn", event, meta);
  },
  error: (event: string, meta?: LogMeta) => {
    log("error", event, meta);
  },
};
