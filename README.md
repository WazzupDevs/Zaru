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

## Kurulum

```bash
pnpm install
```

Bu kadar. İskelet aşamasında daha fazla komut yok. Uygulamalar eklendikçe `turbo run dev`,
`turbo run build`, `turbo run test`, `turbo run lint`, `turbo run typecheck` aktif olur.

## Yol Haritası

[`docs/roadmap.md`](./docs/roadmap.md) — Faz 1–5 planı.

## Kararlar

[`docs/adr/`](./docs/adr/) — Architecture Decision Records.

## İlerleme Günlüğü

[`docs/progress.md`](./docs/progress.md) — her oturum sonunda güncellenir.
