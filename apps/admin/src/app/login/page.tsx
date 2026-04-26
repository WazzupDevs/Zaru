"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiClient, type ApiError } from "@/lib/api-client";

interface OtpRequestResponse {
  requestId: string;
  expiresAt: string;
}

interface OtpVerifyResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phoneE164: string; role: string };
}

export default function LoginPage() {
  // Wrap in Suspense — useSearchParams forces dynamic rendering and Next 15
  // bails the static prerender otherwise.
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-slate-500">
          Yükleniyor…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [phone, setPhone] = useState("+90");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    search.get("reason") === "forbidden" ? "Bu hesap yönetici değil." : null,
  );

  async function handleRequest(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await ApiClient.post<OtpRequestResponse>(
        "/auth/otp/request",
        { phone },
        { auth: false },
      );
      setRequestId(res.requestId);
    } catch (err) {
      const e = err as ApiError;
      setError(e.message ?? `OTP isteği başarısız (${String(e.status)})`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!requestId) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await ApiClient.post<OtpVerifyResponse>(
        "/auth/otp/verify",
        { phone, requestId, code },
        { auth: false },
      );
      if (res.user.role !== "ADMIN") {
        setError(`Bu hesap yönetici değil (rol: ${res.user.role}).`);
        return;
      }
      ApiClient.setTokens(res.accessToken, res.refreshToken);
      router.replace("/");
    } catch (err) {
      const e = err as ApiError;
      setError(e.message ?? `Doğrulama başarısız (${String(e.status)})`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Yönetici Girişi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {requestId === null ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
                Telefon
              </label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                }}
                placeholder="+905551234567"
                pattern="^\+90(5)\d{9}$"
                required
              />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Gönderiliyor..." : "OTP Gönder"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-slate-600">
                <strong>{phone}</strong> numarasına 6 haneli kod gönderildi.
              </p>
              <label className="block text-sm font-medium text-slate-700" htmlFor="code">
                OTP Kodu
              </label>
              <Input
                id="code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Doğrulanıyor..." : "Giriş Yap"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setRequestId(null);
                  setCode("");
                }}
              >
                Telefonu değiştir
              </Button>
            </form>
          )}
          {error !== null && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
