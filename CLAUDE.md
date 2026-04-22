# Proje: Event Fleet Platform (çalışma adı)

## Vizyon

Türkiye'de servis aracı sahipleri ile düğün/nişan/organizasyon müşterilerini buluşturan iki
taraflı mobil pazar yeri. Platform aracılığıyla **sabit fiyat** sunulur, **otomatik ödeme**
alınır, müşteri ile şoför **platform dışında fiyat pazarlığı yapmaz**. Uzun vadede oto kurtarıcı,
vale, kurumsal servis gibi kategorilere genişleyecek.

## Temel Felsefeler (pazarlıksız)

1. **Modüler monolit** — tek deploy, net domain sınırları. Mikroservise SADECE gerçek
   ihtiyaç çıkınca geçeriz.
2. **Event-driven omurga** — modüller birbirinin tablolarını okumaz, sadece domain event
   yayar/dinler. Outbox pattern zorunlu.
3. **Polimorfik domain modeli** — kategoriye özel kod yerine konfigürasyonla yeni vertical
   eklenir. "Düğün için ayrı tablo" ASLA.
4. **Sabit fiyat sunucuda hesaplanır** — client fiyat hesabı yapamaz, sadece gösterir.
5. **Tip güvenliği uçtan uca** — TypeScript her yerde, shared-types paketi üzerinden.
6. **Test-first kritik yollarda** — pricing, booking state machine, payment için önce test.
7. **Güvenilirlik tavizsiz** — idempotency, optimistic lock, audit log, retry, circuit
   breaker en baştan. "Sonra eklerim" yok.

## Teknoloji Seçimleri (sabit)

- **Monorepo:** Turborepo + pnpm
- **Mobil:** React Native + Expo (SDK 52+), EAS Build
- **Backend:** NestJS 10+ (Node 20+), modüler yapı
- **Admin panel:** Next.js 15 App Router + shadcn/ui + Tailwind
- **DB:** PostgreSQL 16 + PostGIS, ORM olarak Prisma
- **Cache/Queue/Realtime:** Redis 7 + BullMQ + Socket.io gateway
- **State machine:** XState (booking flow)
- **Validation:** Zod (class-validator yerine Zod-based pipe)
- **Auth:** JWT access (15dk) + refresh rotation (30gün hashli), OTP (SMS) girişi
- **Ödeme:** iyzico Alt Üye İşyeri (Marketplace)
- **Harita:** Google Maps Platform (Mobile SDK ücretsiz, Distance Matrix/Directions cache'li)
- **SMS:** Netgsm (birincil), İleti Merkezi (failover)
- **E-fatura:** Paraşüt API
- **Dosya depolama:** Cloudflare R2
- **Hosting:** Hetzner VPS + Coolify (başlangıç), prod-ready Docker
- **CI/CD:** GitHub Actions
- **Gözlemlenebilirlik:** Sentry + OpenTelemetry + Grafana Cloud free + Better Stack
- **Feature flag:** Unleash (self-host) veya Flagsmith

## 12 Bounded Context (modül)

Her biri `apps/api/src/modules/<name>/` altında. Her modülün kendi `CLAUDE.md`'si olur.

1. **identity** — kullanıcı, rol, OTP, JWT, refresh token.
2. **catalog** — ServiceCategory, VehicleType, CategoryAttributeDefinition (polimorfik).
3. **supply** — driver profile, evrak, Vehicle, availability calendar, onboarding state.
4. **pricing** — PricingRule, PricingStrategy (strategy pattern), Quote (TTL + imza).
5. **dispatch** — eşleştirme motoru, sürücüye teklif, kabul/ret, reassignment.
6. **booking** — rezervasyon kalbi. XState ile BookingFlow, durum makinesi config'ten.
7. **payment** — iyzico entegrasyonu, provizyon/tahsilat/iade/payout/wallet.
8. **messaging** — in-app chat, PII maskeleme (telefon/IBAN regex filtresi).
9. **notifications** — push + SMS + email. Tek soyutlama, çoklu kanal.
10. **reviews** — rating, moderation, driver reputation score.
11. **billing-compliance** — Paraşüt, KVKK DSAR, audit reporting.
12. **analytics-events** — domain event → analytics pipeline.

Üstlerinde: **admin-ops** (admin panel), iki mobil uygulama.

## Repo Yapısı (hedef)

```
event-fleet/
├── apps/
│   ├── api/               NestJS modüler monolit
│   ├── admin/             Next.js admin panel
│   ├── customer-mobile/   Expo müşteri uygulaması
│   └── driver-mobile/     Expo sürücü uygulaması
├── packages/
│   ├── shared-types/      DTO'lar, enum'lar, Zod şemaları
│   ├── ui/                Ortak RN bileşenleri
│   ├── config-ts/         Paylaşılan tsconfig base
│   └── config-eslint/     Paylaşılan ESLint config
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── infra/
│   ├── docker/            Dockerfile'lar
│   ├── coolify/           Coolify config örnekleri
│   └── grafana/           Dashboard JSON'ları
├── docs/
│   ├── adr/               Architecture Decision Records
│   ├── runbook.md         Incident response
│   └── progress.md        Her oturum sonu özet
├── .github/workflows/     CI/CD
├── turbo.json
├── pnpm-workspace.yaml
├── CLAUDE.md              (bu dosya)
└── README.md
```

## Olmazsa Olmaz Teknik Kurallar

- **Idempotency-Key** her mutating endpoint'te. Redis'te 24h + Postgres'te kalıcı.
- **Optimistic locking** (version kolonu) Booking, Payment, Wallet'ta.
- **Transactional outbox** tüm domain event'ler için. Event kaybı SIFIR.
- **Webhook dedup** — iyzico webhook'ları event_id ile dedup tablosundan geçer.
- **Audit log** User/Booking/Payment/Wallet için JSON diff olarak.
- **Soft delete** (`deleted_at`) her tabloda, DEFAULT'ta filter.
- **UUID v7** primary key (zaman-sıralı), `id` adıyla.
- **Her tabloda** `created_at`, `updated_at`, `deleted_at`, kritiklerde `version`, `tenant_id` (şu an
  tek tenant ama kolon hazır).
- **Secret hiçbir zaman** repo'ya girmez. `.env` sadece local. Prod'da Infisical/Doppler.
- **Fiyat hesabı client'ta ASLA**. Quote sunucuda üretilir, imzalı, TTL'li.
- **Chat mesajlarında PII maskesi** — telefon/IBAN regex'i ile otomatik redaction.
- **Rate limit katmanlı**: Cloudflare → nginx → NestJS throttler.
- **Circuit breaker** iyzico, Google Maps, Netgsm, Paraşüt çağrılarında.
- **SQL:** Prisma öncelik; raw SQL yalnızca PostGIS'te ve **parametreli**.
- **Migration deploy akışı:** Prod'a ve CI'a `prisma migrate deploy` gider.
  `migrate dev` yalnızca lokalde schema yazımı sırasında; committed migration'lar
  `migrate diff --script` ile üretilmiş veya `migrate dev`'in ürettiği SQL manuel
  gözden geçirilmiş olmalı. `migrate dev` prod'da ASLA.

## Kod Stili

- **TypeScript strict mode** her pakette açık. `any` yasak, gerekirse `unknown` + type guard.
- **Her modül** şu alt klasörlere sahip: `domain/` (entities, value objects, events),
  `application/` (use cases, services), `infrastructure/` (repositories, external adapters),
  `interface/` (controllers, DTOs, guards).
- **Dependency rule:** interface → application → domain. Domain dışa bağımsız.
- **İsimlendirme:** dosya kebab-case, sınıf PascalCase, fonksiyon camelCase, enum UPPER_SNAKE.
- **Event isimleri:** geçmiş zaman — `BookingCreated`, `PaymentAuthorized`.
- **Error handling:** kendi `DomainError` hiyerarşisi, HTTP'ye interceptor çevirir.
- **Import sırası:** node builtin → external → internal alias → relative. ESLint zorlar.
- **Her PR'da:** lint + typecheck + unit + affected integration yeşil olmadan merge yok.

## Test Disiplini

- **Unit:** Vitest, domain layer %80+ coverage.
- **Integration:** Testcontainers + real Postgres/Redis. Mock yerine gerçek altyapı.
- **E2E:** Detox (mobil), Playwright (admin). Kritik akışlar nightly.
- **Load:** k6, her major release öncesi zorunlu.
- **Pricing modülü** ve **BookingStateMachine** için TEST-FIRST zorunlu. Yeni davranış
  eklemeden önce failing test yaz.

## Git ve PR Akışı

- **main:** her zaman deploy edilebilir.
- **Branch:** `feat/<modül>-<kısa-açıklama>`, `fix/...`, `chore/...`, `docs/...`.
- **Commit:** Conventional Commits (`feat(pricing): add seasonal multiplier`).
- **PR şablonu:** ne, niye, nasıl test edildi, breaking change var mı, dashboard/metric etkisi.
- **Claude Code kendi kendine merge etmez.** Her PR insan onayıyla (benimle) merge edilir.
- **Commit granülaritesi:** Her oturumda minimum iki commit:
  (a) ana iş — `feat(modül): ...` veya `chore: ...`,
  (b) oturum sonu — `docs: log session <ID> progress`.
  Feature commit'ine `progress.md` güncellemesi ASLA karışmaz. Ayrı tutulur ki git log
  atomik ve revert temiz olsun.
- **Main'e direkt push yok** (A2a'dan itibaren). Her iş branch'te:
  `feat/<module>-<short>` → PR aç → CI yeşil + self-review → squash-merge.
  Solo geliştirici bile olsa PR akışı: template doldurulur, CI gate'i test edilir,
  hook'ların değeri ölçülür.

## Claude Code'un Çalışma Kuralları (BENİM İÇİN KRİTİK)

1. **Büyük değişiklikten önce plan** — bana "şunları yapacağım" listesini göster, onaylayayım,
   sonra yap. Plan mode'u kullan.
2. **Dosya yaratmadan önce var mı kontrol et** — aynı dosyayı tekrar yaratma.
3. **Her oturum sonu** `docs/progress.md` dosyasına güncelleme ekle: ne yapıldı, ne yarım
   kaldı, sıradaki adım ne.
4. **Önemli kararı ADR olarak yaz** — `docs/adr/NNNN-karar-basligi.md` formatında
   (context, decision, consequences, alternatives).
5. **Test yazmadan feature tamamlanmış sayılmaz** — kritik yollarda test-first.
6. **Hata kayırma** — "sonra eklerim" deyip TODO bırakmak yerine ya şimdi yap ya GitHub
   issue olarak bana bildir.
7. **Sürpriz yok** — plan dışında rasgele kütüphane, dosya, yapı eklemez. Stack sabit.
8. **Türkçe cevap ver, kod/yorum İngilizce yaz.** Commit mesajı İngilizce.
9. **Belirsizse SOR** — bir kararı tek başına vermek yerine "şu seçeneklerden hangisi"
   diye sor. Özellikle domain modeli, API şekli, fiyat formülü gibi iş kritik konularda.
10. **Çalışma sonunda her zaman** `docs/progress.md` güncelle ve bir sonraki adımı öner.

## Şu An Kapsam Dışı (yapma)

- Kubernetes, Helm, service mesh
- Mikroservis ayrımı (monolit'te kalıyoruz)
- Event-sourcing full implementasyonu (outbox yeter)
- GraphQL (REST + OpenAPI)
- İkinci bir vertical (kurtarıcı vs) — Faz 4'te
- Numara maskeleme / sesli arama — Faz 2+
- Çoklu tenant — kolon hazır, mantık yok
- Çoklu dil — önce Türkçe; i18n altyapısı kurulu olsun ama tek dil
- Web müşteri uygulaması — sadece mobil + admin
