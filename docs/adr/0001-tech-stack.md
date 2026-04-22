# ADR 0001 — Teknoloji Stack'i

- **Status:** Accepted
- **Date:** 2026-04-22
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Event Fleet Platform, Türkiye'de iki taraflı mobil pazar yeri olarak kuruluyor: müşteriler
düğün/nişan/organizasyon için servis aracı kiralıyor, sürücüler platformu tek gelir kaynağı
gibi kullanabiliyor. MVP'ye tek kişilik bir ekip (kurucu + Claude) ile 4–5 ay içinde
ulaşılmak isteniyor, buna rağmen ilk günden güvenilirlik (idempotency, outbox,
optimistic lock, circuit breaker) tavizsiz.

Stack seçiminde birincil kısıtlar:

- Tek geliştirici için düşük operasyonel yük (Kubernetes yok).
- TypeScript ile uçtan uca tip güvenliği (mobil + backend + admin).
- Türkiye'ye özgü entegrasyonlar: iyzico Alt Üye İşyeri, Netgsm/İleti Merkezi, Paraşüt.
- Mobil first — iki ayrı uygulama (müşteri + sürücü) hızlı iterasyon gerektirir.
- Event-driven modüler monolit (bkz. ADR 0002) — dil/runtime tekliği avantaj sağlar.

## Decision

Aşağıdaki stack sabit kabul edilir. Plan dışı eklemeler ADR gerektirir.

| Katman        | Seçim                                                           | Gerekçe                                                            |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Monorepo      | Turborepo + pnpm                                                | Tek dil (TS), remote cache desteği, pnpm workspace efficiency      |
| Mobil         | React Native + Expo SDK 52+, EAS Build                          | Tek kod tabanı iki app, OTA update, EAS native build               |
| Backend       | NestJS 10+ (Node 20+)                                           | Modüler DI, decorator ekosistemi, enterprise-grade yapı            |
| Admin         | Next.js 15 App Router + shadcn/ui + Tailwind                    | Server components, düşük tooling yükü, hızlı admin                 |
| Veri tabanı   | PostgreSQL 16 + PostGIS                                         | ACID, JSONB (polimorfik attribute), coğrafi sorgular               |
| ORM           | Prisma                                                          | Tip-güvenli query, migration tooling; raw SQL sadece PostGIS       |
| Cache/Queue   | Redis 7 + BullMQ + Socket.io                                    | Tek araçla cache, queue, pub/sub, realtime                         |
| State machine | XState                                                          | Booking flow config'ten sürülebilir, test edilebilir               |
| Validation    | Zod (Zod-based Nest pipe)                                       | Mobil/backend/admin'de aynı şema, class-validator duplikasyonu yok |
| Auth          | JWT access (15dk) + refresh rotation (30gün hashli) + OTP (SMS) | Stateless + rotation, şifresiz onboarding                          |
| Ödeme         | iyzico Alt Üye İşyeri (Marketplace)                             | TR pazarı için standart, marketplace payout desteği                |
| Harita        | Google Maps Platform                                            | Mobile SDK ücretsiz, Distance Matrix/Directions cache'li           |
| SMS           | Netgsm (primary) + İleti Merkezi (failover)                     | TR lokal sağlayıcılar, OTP SLA                                     |
| E-fatura      | Paraşüt API                                                     | TR muhasebe entegrasyonu                                           |
| Dosya         | Cloudflare R2                                                   | S3 uyumlu, egress ücreti yok                                       |
| Hosting       | Hetzner VPS + Coolify                                           | Düşük maliyet, self-hosted PaaS, Docker-native                     |
| CI/CD         | GitHub Actions                                                  | Monorepo pipeline, Turborepo ile cache                             |
| Observability | Sentry + OpenTelemetry + Grafana Cloud free + Better Stack      | Error tracking + traces + metrics + uptime ayrı sorumluluklar      |
| Feature flag  | Unleash (self-host) veya Flagsmith                              | OSS, kill switch + kademeli rollout                                |

## Consequences

### Pozitif

- Tek dil (TypeScript) öğrenme ve context switch maliyetini minimize eder.
- Sharing `shared-types` paketi ile API sözleşmeleri derleme-zamanı kontrol edilir.
- Self-hosted tercihler (Coolify, Unleash) OpEx'i düşürür; MVP bütçe-dostu.
- Zod-based pipe, class-validator + DTO duplikasyonunu ortadan kaldırır.

### Negatif / Risk

- Node.js backend CPU-yoğun iş yükleri için ideal değil; pricing karmaşıklaşırsa worker thread
  veya Go/Rust servisine ihtiyaç doğabilir. ADR 0002 (monolit) gerekirse revize edilir.
- Expo SDK bağımlılığı; native modül gerekirse "bare workflow"a düşülür.
- Self-hosted Coolify tek makine hatasında tüm platformu etkiler; Faz 5'te HA stratejisi
  (replica + pg failover) gündeme alınır.
- Google Maps maliyeti hacimle büyür; Distance Matrix sonuçlarının Redis cache'i zorunlu.
- iyzico Marketplace onboarding tek sağlayıcıya bağlıyor; alternatif (PayTR, Param) için
  payment modülünde provider abstraction sürdürülür.

## Alternatives Considered

- **Go backend (Fiber/Echo) + React Native mobil** — reddedildi: dil tekliği kaybı, solo
  geliştirici için context switch maliyeti, `shared-types` zorlaşır.
- **Supabase BaaS** — reddedildi: iyzico marketplace + Paraşüt + modüler monolit tasarımı
  RLS + edge functions ile tekrar yazmak gerekir; outbox + saga pattern sınırlanır.
- **AWS ECS/EKS** — reddedildi: solo ekip için operasyonel yük çok yüksek; MVP'de Hetzner
  - Coolify yeterli. Ölçek gelince revize.
- **tRPC yerine REST + OpenAPI** — REST tercih edildi: admin paneli ve 3rd party entegrasyonlar
  (iyzico webhook dahil) için OpenAPI schema contract daha taşınabilir; tRPC sonradan
  iç endpoint'ler için eklenebilir.
- **GraphQL (Apollo)** — reddedildi: MVP'de over-fetching sorunu yok, ekibi öğrenme
  yükünden koruma öncelikli; REST + OpenAPI yeterli.
- **Firebase / Expo Notifications-only** — reddedildi: Sürücü kabul süresi kritik SLA,
  Socket.io realtime + Expo push kombinasyonu daha doğru.
