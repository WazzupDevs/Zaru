import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClockModule } from "../src/common/clock/clock.module";
import { S3Storage } from "../src/common/storage/s3-storage";
import { StorageBootstrapService } from "../src/common/storage/storage-bootstrap.service";
import { StorageModule } from "../src/common/storage/storage.module";
import { STORAGE_PORT, type StoragePort } from "../src/common/storage/storage.port";
import { validateEnv } from "../src/config/env";

/**
 * Real MinIO via Testcontainers (booted in setup-integration.ts).
 * Verifies the round-trip: presigned PUT → curl-style upload → public GET,
 * plus the Content-Length-signed reject path that protects max file size.
 */
describe("S3Storage (MinIO)", () => {
  let moduleRef: TestingModule;
  let storage: StoragePort;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: (raw) => validateEnv(raw), cache: true }),
        ClockModule,
        StorageModule,
      ],
    })
      // The real StorageBootstrapService injects PinoLogger via InjectPinoLogger,
      // which would force us to import nestjs-pino's LoggerModule just for tests
      // that don't care about logs. Bucket creation is already handled by
      // setup-integration.ts when the MinIO container boots, so disable the
      // bootstrap hook here entirely.
      .overrideProvider(StorageBootstrapService)
      .useValue({
        onApplicationBootstrap: async () => {
          /* no-op in tests */
        },
      })
      .compile();
    storage = moduleRef.get<StoragePort>(STORAGE_PORT);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it("presigned upload → public GET round-trip", async () => {
    const key = `tests/round-trip-${Date.now().toString()}.txt`;
    const body = "hello eventfleet";

    const presigned = await storage.createPresignedUploadUrl({
      key,
      contentType: "text/plain",
      maxSizeBytes: Buffer.byteLength(body),
      expiresInSeconds: 60,
    });
    expect(presigned.uploadUrl).toMatch(/X-Amz-Signature/);
    expect(presigned.publicUrl).toContain(key);

    const putRes = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/plain", "Content-Length": String(Buffer.byteLength(body)) },
      body,
    });
    expect(putRes.status).toBe(200);

    // GET via the public URL (anonymous read enabled by setup-integration).
    const getRes = await fetch(presigned.publicUrl);
    expect(getRes.status).toBe(200);
    expect(await getRes.text()).toBe(body);

    const meta = await storage.getObjectMetadata(key);
    expect(meta).not.toBeNull();
    expect(meta?.size).toBe(Buffer.byteLength(body));
  });

  it("rejects upload that violates the signed Content-Length", async () => {
    const key = `tests/oversize-${Date.now().toString()}.bin`;
    const presigned = await storage.createPresignedUploadUrl({
      key,
      contentType: "application/octet-stream",
      maxSizeBytes: 16, // hard cap
      expiresInSeconds: 60,
    });

    const tooBig = Buffer.alloc(64, 0xff);
    const res = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(tooBig.byteLength),
      },
      body: tooBig,
    });
    // S3 rejects when Content-Length doesn't match the signed value.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("getObjectMetadata returns null for missing keys", async () => {
    const meta = await storage.getObjectMetadata("tests/does-not-exist.txt");
    expect(meta).toBeNull();
  });

  it("healthCheck returns true when bucket is reachable", async () => {
    expect(await storage.healthCheck()).toBe(true);
  });

  it("S3Storage is the default STORAGE_PORT binding", () => {
    expect(moduleRef.get(S3Storage)).toBeInstanceOf(S3Storage);
  });
});
