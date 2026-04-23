import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";

describe("App e2e", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL ??=
      "postgresql://eventfleet:eventfleet@localhost:5432/eventfleet?schema=public";
    process.env.REDIS_URL ??= "redis://localhost:6379";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /healthz returns 200 with x-request-id header", async () => {
    const res = await request(app.getHttpServer()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["x-request-id"]?.length).toBeGreaterThan(0);
  });

  it("echoes a caller-provided x-request-id header back in the response", async () => {
    const provided = "test-req-id-01HXYZ";
    const res = await request(app.getHttpServer()).get("/healthz").set("x-request-id", provided);
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(provided);
  });

  it("returns DomainError-shaped 404 body for unknown routes", async () => {
    const res = await request(app.getHttpServer()).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });
});
