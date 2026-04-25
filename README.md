# Event Fleet Platform

Türkiye'de servis aracı sahipleri ile düğün, nişan ve organizasyon müşterilerini buluşturan
iki taraflı mobil pazar yeri. Sabit fiyat, otomatik ödeme, platform-içi rezervasyon.

> Tam proje kimliği, mimari kararlar ve çalışma kuralları için [`CLAUDE.md`](./CLAUDE.md)
> dosyasına bakın. Bu README sadece geliştirici giriş noktasıdır.

## Yapı

Turborepo + pnpm tabanlı monorepo. Modüler monolit backend (NestJS), iki Expo mobil
uygulama (müşteri + sürücü), Next.js admin paneli ve paylaşılan paketler.

```
apps/        api · admin · customer-mobile · driver-mobile
packages/    shared-types · ui · config-ts · config-eslint
prisma/      schema · migrations
infra/       docker · coolify · grafana
docs/        adr · progress · roadmap · runbook
```

## Gereksinimler

- Node.js 20 (LTS) — `.nvmrc` dosyası mevcut, `nvm use` ile sabitle
- pnpm 9+
- Docker (Postgres + Redis için, ileri aşamada)

## Status

**Faz 1 (User & Supply foundation) tamamlandı.** Identity (OTP + JWT + refresh
rotation), polymorphic catalog, supply (driver + vehicle + document +
availability) ve admin onay paneli production-ready. Faz 2 (booking + ödeme +
dispatch + mobile) sıradaki büyük blok. Detay:
[`docs/phase-1-closeout.md`](./docs/phase-1-closeout.md).

## Hızlı Başlangıç

```bash
pnpm install
pnpm db:up                       # Postgres + Redis + MinIO (Docker)
cp .env.example .env             # PII_HMAC_SECRET, JWT secrets, BOOTSTRAP_ADMIN_PHONE düzenle
pnpm prisma migrate deploy --schema prisma/schema.prisma
pnpm db:seed                     # wedding-car kategorisi + bootstrap admin
pnpm dev                         # API (3000) + admin (3001) paralel
```

Servisler:

- **API:** http://localhost:3000 (`/healthz`, `/readyz`, `/version`)
- **Admin:** http://localhost:3001 (`/login` → BOOTSTRAP_ADMIN_PHONE ile OTP)
- **MinIO Console:** http://localhost:9001 (minioadmin / minioadmin)

İlk admin için: `BOOTSTRAP_ADMIN_PHONE`'a yazdığın numara ile `/login`'e git,
OTP gönder, kodu API loglarından (MockSmsSender) al, doğrula → admin paneli açılır.

Test:

```bash
pnpm -r test                     # ~210 unit/integration test
pnpm --filter @event-fleet/api test:integration  # Testcontainers
```

Prod'da yeni admin (kullanıcı önce OTP ile kayıt olmuş olmalı):

```bash
pnpm api:promote-admin +905551234567
```

## Yol Haritası

[`docs/roadmap.md`](./docs/roadmap.md) — Faz 1–5 planı.

## Kararlar

[`docs/adr/`](./docs/adr/) — Architecture Decision Records.

## İlerleme Günlüğü

[`docs/progress.md`](./docs/progress.md) — her oturum sonunda güncellenir.
