# Roadmap — Event Fleet Platform

5 fazlık, MVP odaklı plan. Her faz **Definition of Done** ile biter; bir sonraki faza
geçmeden önce DoD doğrulanır. Süreler tek geliştirici (Claude + kurucu) için tahmini.

---

## Faz 1 — Temel (Foundation)

**Süre tahmini:** 2–3 hafta

Repo, CI, paylaşılan paketler, DB skeleton, identity modülünün uçtan uca dilimi.

### Kapsam

- Monorepo iskeleti (Turborepo + pnpm workspaces) — _bu oturumda tamam._
- Paylaşılan paketler: `shared-types`, `config-ts`, `config-eslint`, (ileride) `ui`.
- `apps/api` NestJS modüler monolit kurulumu, sağlık endpoint'i.
- Prisma + Postgres bağlantısı, ilk migration (User, RefreshToken, Outbox iskeleti).
- `identity` modülü: OTP iste/doğrula, JWT + refresh rotation, role enum.
- Global middleware: request-id, structured logging, error interceptor, Idempotency-Key
  filter (Redis tabanlı).
- Sentry + OpenTelemetry temel kurulum.
- GitHub Actions CI: lint + typecheck + unit test job'ları gerçek işle.
- Docker Compose: postgres + redis local geliştirme için.

### Definition of Done

- `pnpm install && pnpm typecheck && pnpm lint && pnpm test` lokalde ve CI'da yeşil.
- Postman/HTTPie ile OTP akışı baştan sona çalışıyor (mock SMS).
- Domain event yayma (BookingCreated örneğiyle) outbox tablosuna düşüyor; worker outbox'u
  drain ediyor (henüz handler yok).
- ADR 0001 (stack), 0002 (monolit), 0003 (Prisma), 0004 (outbox) yazılı.

---

## Faz 2 — Arz Tarafı (Supply + Catalog)

**Süre tahmini:** 3–4 hafta

Sürücü onboarding, araç envanteri, polimorfik kategori sistemi.

### Kapsam

- `catalog` modülü: ServiceCategory, VehicleType, CategoryAttributeDefinition (JSONB
  tabanlı dynamic attribute schema). Düğün kategorisinin ilk konfigürasyonu seed.
- `supply` modülü: Driver profile state machine (PENDING → DOCS_REQUIRED → REVIEW →
  APPROVED / REJECTED), Vehicle CRUD, evrak yükleme (R2), availability calendar.
- Admin panel ilk sürümü (`apps/admin`): driver moderation kuyrugu, doküman approve/reject.
- Driver mobil uygulamasının ilk sürümü (`apps/driver-mobile`): OTP login, profile
  doldurma, doküman çekme/yükleme, takvim ekranı.

### Definition of Done

- Bir sürücü mobilden OTP ile giriş yapıp evrak yükleyebiliyor; admin panelden onaylayan
  görüyor; onay sonrası sürücü "available" durumuna geçebiliyor.
- Düğüne özel attribute (örn. tavan tipi, koltuk sayısı, dış süs uygunluğu) tanımlanmış
  ve sürücü aracında doldurulabiliyor.
- `catalog` ile `supply` arasında kod bağımlılığı yok — sadece event üzerinden konuşuyorlar.

---

## Faz 3 — Talep Çekirdeği (Pricing + Booking + Dispatch + Payment)

**Süre tahmini:** 4–5 hafta

Müşteri rezervasyon yapıyor, sistem fiyat hesaplıyor, sürücü atanıyor, ödeme alınıyor.

### Kapsam

- `pricing` modülü: PricingRule entity, PricingStrategy interface, ilk strategy
  (mesafe + süre + kategori multiplier + sezon faktörü). Quote üretimi (TTL'li, imzalı).
  **TEST-FIRST.**
- `booking` modülü: XState BookingFlow (DRAFT → QUOTED → CONFIRMED → DISPATCHED →
  IN_PROGRESS → COMPLETED / CANCELLED). State'ler config'ten. **TEST-FIRST.**
- `dispatch` modülü: hazır sürücü havuzundan eşleşme, sürücüye push teklifi, kabul/ret,
  reassignment kuyrugu (BullMQ).
- `payment` modülü: iyzico Marketplace entegrasyonu — provizyon (auth), capture, refund,
  payout. Webhook dedup tablosu. Wallet entity (sürücü bakiyesi).
- Müşteri mobil uygulaması (`apps/customer-mobile`): kategori seç → tarih/saat →
  konum → quote göster → ödeme → confirm.
- Tüm kritik path'lerde idempotency key, optimistic lock, audit log.

### Definition of Done

- Müşteri uygulamadan rezervasyon oluşturuyor, kart bilgisini iyzico ile saklayıp
  provizyon alınıyor; sürücü atanıyor; iş tamamlanınca capture + payout başlıyor.
- iyzico sandbox webhook'ları dedup'tan geçip booking state'ini güncelliyor.
- Booking ve Pricing modüllerinde Vitest coverage %80+.
- ADR'lar: pricing strategy seçimi, iyzico marketplace flow, refund politikası.

---

## Faz 4 — Etkileşim ve Operasyon (Reviews + Messaging + Notifications)

**Süre tahmini:** 3–4 hafta

Çift taraflı puanlama, in-app sohbet (PII filtresi ile), push/SMS bildirimleri,
admin operasyon araçları olgunlaşıyor.

### Kapsam

- `messaging` modülü: rezervasyon başına chat thread, mesaj okundu işareti,
  PII regex maskesi (telefon/IBAN otomatik redaction).
- `notifications` modülü: tek soyutlama, push (Expo) + SMS (Netgsm/İleti Merkezi
  failover) + email kanalları. Template registry.
- `reviews` modülü: müşteri sürücüyü, sürücü müşteriyi puanlıyor; reputation score
  bookingden sonra X gün içinde toplanıyor; moderation kuyrugu.
- `billing-compliance` modülü: Paraşüt API ile e-fatura, KVKK DSAR endpoint
  (kullanıcı verilerini export/silme).
- Admin panel olgun sürümü: booking arama, dispute kuyrugu, payout raporları.
- İkinci vertical pilotu (örn. oto kurtarıcı) için catalog konfigürasyonu — kod
  değişikliği gerekmemeli; gerekiyorsa polimorfizm bozuk demektir.

### Definition of Done

- Bir rezervasyon için müşteri ve sürücü chat üzerinden konuşuyor, PII maskesi log'da
  doğrulanıyor.
- Booking tamamlanınca her iki taraf da puan veriyor; düşük puanlar admin paneline
  düşüyor.
- Tamamlanmış rezervasyon için Paraşüt'te e-fatura otomatik oluşuyor.
- KVKK DSAR endpoint'leri test edildi.

---

## Faz 5 — Lansman Hazırlığı (Hardening + Launch)

**Süre tahmini:** 2–3 hafta

Performans, güvenlik, gözlemlenebilirlik, beta lansman.

### Kapsam

- k6 ile load test: pricing, booking create, dispatch akışları için target SLO'lar.
- Güvenlik geçişi: OWASP Top 10 checklist, dependency scanning (Snyk/Dependabot),
  secret scanning (gitleaks), rate limit doğrulaması (Cloudflare + nginx + Nest).
- Circuit breaker doğrulama: iyzico/Maps/SMS sandbox'larını fault-inject ile test.
- Grafana dashboard'ları: API latency, BullMQ queue depth, payment success rate,
  driver acceptance rate, outbox lag.
- Runbook (`docs/runbook.md`): incident senaryoları (iyzico down, postgres failover,
  redis kaybı), pager rotasyonu (kurucu tek kişi — eskalasyon planı).
- EAS Build production profilleri, store submit (App Store + Google Play).
- Coolify production deploy, blue-green veya canary stratejisi.
- Beta kullanıcı kohortu (kapalı, davetli) ile 2–4 haftalık pilot.

### Definition of Done

- k6 load testleri targeted SLO'ların altında yeşil.
- Sentry'de critical alert kanalları aktif, Better Stack uptime monitor çalışıyor.
- Mobil uygulamalar TestFlight ve Internal Testing'de.
- Beta kohortundan ilk gerçek rezervasyon ve ödeme uçtan uca tamamlandı.
- Post-launch retro yazıldı, Faz 6 (ölçeklendirme + ikinci vertical) için backlog hazır.
