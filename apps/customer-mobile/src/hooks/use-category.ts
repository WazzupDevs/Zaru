import { useCallback, useEffect, useState } from "react";

import { catalogApi } from "../lib/api";
import { type ServiceCategoryDetail } from "../lib/api/catalog";
import { ApiError, NetworkError } from "../lib/api/errors";

export interface UseCategoryResult {
  data: ServiceCategoryDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hand-rolled fetch + state pattern (no react-query). Mobile's surface
 * for A4d-2 is small enough that the four-state machine
 * (idle/loading/data/error) doesn't justify the dep + cache-layer cost.
 * Revisit at A4d-3 if we cross ~10 screens.
 */
export function useCategory(slug: string): UseCategoryResult {
  const [data, setData] = useState<ServiceCategoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await catalogApi.getCategoryBySlug(slug);
      setData(result);
    } catch (err) {
      setError(translateCatalogError(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

function translateCatalogError(err: unknown): string {
  if (err instanceof NetworkError) return "Bağlantı yok, tekrar deneyin";
  if (err instanceof ApiError) {
    if (err.status === 404) return "Kategori bulunamadı";
    return err.message || "Kategori yüklenemedi";
  }
  return "Beklenmeyen hata";
}
