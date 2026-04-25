"use client";

import { useEffect, useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClient, type ApiError } from "@/lib/api-client";

import type { DriverProfileResponse } from "@event-fleet/shared-types";

interface PendingPage {
  items: DriverProfileResponse[];
  nextCursor: string | null;
}

function newIdempotencyKey(prefix: string): string {
  // crypto.randomUUID is available in modern browsers; fallback for older.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`;
}

export default function PendingDriversPage() {
  const [drivers, setDrivers] = useState<DriverProfileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get<PendingPage>("/admin/supply/driver-profiles?limit=100");
      setDrivers(res.items);
      setError(null);
    } catch (err) {
      setError((err as ApiError).message ?? "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string): Promise<void> {
    setBusyId(id);
    try {
      await ApiClient.post(
        `/admin/supply/driver-profiles/${id}/approve`,
        {},
        { headers: { "Idempotency-Key": newIdempotencyKey("approve") } },
      );
      setDrivers((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError((err as ApiError).message ?? "Onay başarısız");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string): Promise<void> {
    // MVP UX: prompt() — A4'te shadcn Dialog + textarea + length validation.
    const reason = window.prompt("Red sebebi (en az 5 karakter):");
    if (reason === null || reason.trim().length < 5) return;
    setBusyId(id);
    try {
      await ApiClient.post(
        `/admin/supply/driver-profiles/${id}/reject`,
        { rejectionReason: reason.trim() },
        { headers: { "Idempotency-Key": newIdempotencyKey("reject") } },
      );
      setDrivers((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError((err as ApiError).message ?? "Reddetme başarısız");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Onay Bekleyen Sürücüler ({drivers.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          Yenile
        </Button>
      </CardHeader>
      <CardContent>
        {error !== null && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        {loading ? (
          <p className="py-8 text-center text-slate-500">Yükleniyor…</p>
        ) : drivers.length === 0 ? (
          <p className="py-8 text-center text-slate-500">Onay bekleyen sürücü yok.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>İsim</TableHead>
                <TableHead>IBAN Son 4</TableHead>
                <TableHead>Başvuru Tarihi</TableHead>
                <TableHead className="text-right">Aksiyonlar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    {d.firstName} {d.lastName}
                  </TableCell>
                  <TableCell className="font-mono text-slate-500">****{d.ibanLast4}</TableCell>
                  <TableCell className="text-slate-500">
                    {new Date(d.createdAt).toLocaleString("tr-TR")}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" onClick={() => void approve(d.id)} disabled={busyId !== null}>
                      Onayla
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void reject(d.id)}
                      disabled={busyId !== null}
                    >
                      Reddet
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
