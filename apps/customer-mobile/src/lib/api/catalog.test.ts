import { describe, expect, it, vi } from "vitest";

import { createCatalogApi } from "./catalog";
import { createApiClient } from "./client";

function clientWithMockFetch(fetchImpl: ReturnType<typeof vi.fn>) {
  return createApiClient({
    baseUrl: "http://api.test",
    fetchImpl,
    hooks: {
      getTokens: vi.fn(() => Promise.resolve(null)),
      setTokens: vi.fn(() => Promise.resolve()),
      clearTokens: vi.fn(() => Promise.resolve()),
    },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleCategory = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "wedding-car",
  name: "Düğün Aracı",
  description: "Vintage + modern düğün araçları",
  type: "PLANNED_EVENT",
  iconUrl: null,
  isActive: true,
  sortOrder: 0,
  vehicleTypes: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      categoryId: "11111111-1111-1111-1111-111111111111",
      slug: "vintage-mercedes",
      name: "Vintage Mercedes",
      description: "1970'ler klasik",
      capacityMin: 2,
      capacityMax: 4,
      isActive: true,
      sortOrder: 0,
    },
  ],
  attributeDefinitions: [],
};

describe("catalogApi", () => {
  it("getCategoryBySlug parses the strict ServiceCategoryDetail shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, sampleCategory));
    const catalog = createCatalogApi(clientWithMockFetch(fetchImpl));

    const result = await catalog.getCategoryBySlug("wedding-car");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/catalog/categories/wedding-car",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.vehicleTypes).toHaveLength(1);
    expect(result.vehicleTypes[0]?.slug).toBe("vintage-mercedes");
  });

  it("getCategoryBySlug encodes slug-with-special-chars (defensive)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { ...sampleCategory, slug: "tow-truck" }));
    const catalog = createCatalogApi(clientWithMockFetch(fetchImpl));

    await catalog.getCategoryBySlug("tow truck");

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/catalog/categories/tow%20truck",
      expect.anything(),
    );
  });

  it("getCategoryBySlug rejects when API returns shape that fails Zod parse", async () => {
    // Server bug or schema drift — vehicleTypes[].capacityMin missing.
    const firstVt = sampleCategory.vehicleTypes[0];
    if (!firstVt) throw new Error("fixture needs at least one vehicleType");
    const broken = {
      ...sampleCategory,
      vehicleTypes: [{ id: firstVt.id, slug: "x", name: "X" }],
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, broken));
    const catalog = createCatalogApi(clientWithMockFetch(fetchImpl));

    await expect(catalog.getCategoryBySlug("wedding-car")).rejects.toThrow();
  });

  it("listCategories parses an array of ServiceCategory", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, [sampleCategory]));
    const catalog = createCatalogApi(clientWithMockFetch(fetchImpl));

    const result = await catalog.listCategories();

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("wedding-car");
  });
});
