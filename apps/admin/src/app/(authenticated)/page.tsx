"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClient, type ApiError } from "@/lib/api-client";

import type { DriverProfileResponse } from "@event-fleet/shared-types";

interface PendingPage {
  items: DriverProfileResponse[];
  nextCursor: string | null;
}

export default function DashboardPage() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await ApiClient.get<PendingPage>("/admin/supply/driver-profiles?limit=100");
        if (!cancelled) setPendingCount(res.items.length);
      } catch (err) {
        if (!cancelled) {
          setError((err as ApiError).message ?? "Bekleyen sürücüler yüklenemedi");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Genel Bakış</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-500">
              Onay Bekleyen Sürücü
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">
              {pendingCount === null ? "—" : pendingCount}
            </p>
            {error !== null && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <Link
              href="/drivers/pending"
              className="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Kuyruğu Aç
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
