import { createHash } from "node:crypto";

/**
 * Canonical JSON serialiser: sorts object keys recursively so equivalent
 * payloads always produce the same string.
 */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",") + "}";
}

/**
 * Stable request fingerprint for idempotency dedup:
 *   sha256(method + ":" + path + ":" + canonicalJson(body))
 */
export function computeRequestHash(method: string, path: string, body: unknown): string {
  const payload = `${method}:${path}:${canonicalJson(body ?? null)}`;
  return createHash("sha256").update(payload).digest("hex");
}
