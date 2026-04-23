import { execSync } from "node:child_process";
import path from "node:path";

import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { configureApp } from "../src/configure-app";

describe("Catalog e2e — public read endpoints", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Seed runs against the Testcontainers Postgres exposed by setup-integration.ts
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    execSync(`pnpm db:seed`, {
      cwd: repoRoot,
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /catalog/categories returns active categories (no auth required)", async () => {
    const res = await request(app.getHttpServer()).get("/catalog/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const wedding = (res.body as { slug: string }[]).find((c) => c.slug === "wedding-car");
    expect(wedding).toBeDefined();
    expect(wedding).toMatchObject({
      slug: "wedding-car",
      name: "Düğün Arabası",
      type: "PLANNED_EVENT",
      isActive: true,
    });
  });

  it("GET /catalog/categories/wedding-car returns nested vehicleTypes + attributeDefinitions", async () => {
    const res = await request(app.getHttpServer()).get("/catalog/categories/wedding-car");
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("wedding-car");
    expect(Array.isArray(res.body.vehicleTypes)).toBe(true);
    expect(res.body.vehicleTypes.length).toBe(4);
    expect(res.body.vehicleTypes[0]).toMatchObject({
      slug: expect.any(String),
      capacityMin: expect.any(Number),
      capacityMax: expect.any(Number),
    });

    expect(Array.isArray(res.body.attributeDefinitions)).toBe(true);
    expect(res.body.attributeDefinitions.length).toBe(5);
    const trimColor = (res.body.attributeDefinitions as { key: string }[]).find(
      (a) => a.key === "trim_color",
    );
    expect(trimColor).toMatchObject({
      key: "trim_color",
      dataType: "ENUM",
      scope: "VEHICLE",
      isRequired: true,
      enumOptions: expect.arrayContaining(["white", "red"]),
    });
  });

  it("GET /catalog/categories/:slug returns 404 for unknown slug", async () => {
    const res = await request(app.getHttpServer()).get("/catalog/categories/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("GET /catalog/categories/:slug returns 400 for invalid slug format", async () => {
    const res = await request(app.getHttpServer()).get("/catalog/categories/Wedding_Car");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_SLUG");
  });

  it("soft-deleted categories don't appear in the list", async () => {
    // Create a throwaway active category, soft-delete it, ensure it's hidden.
    const created = await prisma.client.serviceCategory.create({
      data: {
        slug: "soft-delete-me",
        name: "Throwaway",
        type: "PLANNED_EVENT",
        isActive: true,
        sortOrder: 999,
      },
    });
    await prisma.client.serviceCategory.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer()).get("/catalog/categories");
    const slugs = (res.body as { slug: string }[]).map((c) => c.slug);
    expect(slugs).not.toContain("soft-delete-me");
  });

  it("GET /catalog/categories/wedding-car/vehicle-types returns the nested list directly", async () => {
    const res = await request(app.getHttpServer()).get(
      "/catalog/categories/wedding-car/vehicle-types",
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    const slugs = (res.body as { slug: string }[]).map((v) => v.slug);
    expect(slugs).toEqual(expect.arrayContaining(["classic-sedan", "vip-sedan", "minibus"]));
  });
});
