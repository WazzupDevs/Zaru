# ADR 0002 — Modüler Monolit (Mikroservis Değil)

- **Status:** Accepted
- **Date:** 2026-04-22
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Event Fleet Platform 12 bounded context (identity, catalog, supply, pricing, dispatch,
booking, payment, messaging, notifications, reviews, billing-compliance, analytics-events)
etrafında kurgulanıyor. Bir uçta "her bounded context ayrı servis" (mikroservis), diğer
uçta "tek büyük paket" (klasik monolit) var. Tek geliştiriciyle (kurucu + Claude) 4–5 ay
içinde MVP'ye ulaşma hedefi ve güvenilirlik tavizi vermeme isteği belirleyici kısıt.

Sorulması gereken soru: "Modül sınırlarını katı tutmadan da monolit başarılı olur mu?"
Endüstri tecrübesi buna hayır diyor — sınırsız monolit hızla "büyük çamur topu"na döner.
Modüler monolit, modül sınırlarını **derleme zamanı** ve **kod review** disiplini ile
korur; sonraki mikroservis ayrıştırması mümkün kalır, ama öncesinde ödenmez.

## Decision

**Modüler monolit benimsenir.** Somut kurallar:

1. **Tek deploy, tek runtime.** `apps/api` tek NestJS süreci olarak deploy edilir.
2. **Modüller `apps/api/src/modules/<name>/` altında**, her biri kendi
   `domain/application/infrastructure/interface/` katmanlarına sahip.
3. **Modüller birbirinin tablosunu okumaz.** Cross-module iletişim **domain event'ler**
   üzerinden yapılır. Eşzamanlı ihtiyaç varsa **public application service** (in-process
   method call) kullanılır; repository'ye doğrudan erişim yasak.
4. **Transactional outbox zorunlu.** Event yayınlamayan modül yok varsayılır; event
   kaybı sıfır olmalı. Outbox worker aynı süreçte çalışır, BullMQ queue'ya push eder.
5. **Dependency rule:** `interface → application → domain`. Domain hiçbir şeye bağımlı değil.
6. **Paylaşılan kütüphaneler `packages/` altında** (`shared-types`, `ui`, config'ler).
   Her şey TypeScript, workspace importlarıyla.
7. **Mikroservise ayırma tetiği:** üç net kriter — (a) ölçeklendirme ihtiyacı modül
   seviyesinde asimetrik, (b) takım sayısı modül başına ayrılacak kadar büyüdü, (c)
   teknoloji heterojenliği gerçekten gerekli. İkisi birden olmadan ayrılma yapılmaz.

## Consequences

### Pozitif

- Tek deploy, tek log stream, tek migration yolu — operasyonel yük minimum.
- Transactional boundary'ler aynı DB üzerinde garantilenebilir; saga kompleksitesi yok.
- Refactoring kolaylığı: modül sınırını değiştirmek in-process kod hareketi; mikroservis
  ayrımında network + schema migration olurdu.
- Local geliştirme hızlı: tek `pnpm dev` komutu.

### Negatif / Risk

- Modül sınırlarını bir developer disiplinsizlikten kırabilir (ör. başka modülün Prisma
  tablosunu import eder). **Mitigation:** ESLint kural seti (`no-restricted-imports`) +
  kod review + CLAUDE.md kuralı.
- Ölçek geldiğinde (ör. dispatch aşırı yüklenirse) tek süreçte darboğaz oluşabilir.
  **Mitigation:** BullMQ worker'ları ayrı process olarak çalıştırılabilir; bu
  monolit'ten çıkmak değil, aynı kodu farklı entrypoint ile başlatmak demektir.
- Event sıralama / idempotency yine üretilmeli — outbox + consumer-side idempotency key
  şart.

## Alternatives Considered

- **Tam mikroservis (12 servis)** — reddedildi: solo geliştirici için dağıtık sistem
  karmaşıklığı (service discovery, distributed tracing, schema registry, saga) ezici;
  MVP hızını 3–4 katına çıkarır.
- **Serverless (AWS Lambda per module)** — reddedildi: iyzico webhook dedup, outbox
  worker, Socket.io realtime gibi uzun-yaşamlı süreçler Lambda'ya doğal oturmaz;
  soğuk-başlangıç latency dispatch için sorunludur.
- **Klasik (sınırsız) monolit** — reddedildi: orta vadede sınırsız bağımlılık grafiği,
  refaktörü imkansızlaştıran bağımlılık hairball'u.
- **Event-sourcing full implementasyonu** — reddedildi (şu an): projeksiyon rebuild,
  snapshot, upcasting, ve temporal query ihtiyacı MVP'de yok. Outbox + audit log
  yeterli. Faz 4+ revize edilebilir.
