"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useRequireAuth, logout } from "@/lib/auth";

/**
 * Protects every page under this route group. Pages render only after
 * useRequireAuth confirms an ADMIN session — non-admin tokens get
 * bounced back to /login?reason=forbidden.
 */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useRequireAuth({ requireRole: "ADMIN" });

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-500">
        Yükleniyor…
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold text-slate-900">
              Event Fleet Admin
            </Link>
            <Link href="/drivers/pending" className="text-sm text-slate-600 hover:text-slate-900">
              Onay Bekleyen Sürücüler
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{user.phoneE164}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                logout(router);
              }}
            >
              Çıkış
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
