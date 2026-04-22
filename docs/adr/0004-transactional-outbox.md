# ADR 0004 — Transactional Outbox for Domain Events

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

CLAUDE.md "olmazsa olmaz" listesinde: **"Transactional outbox tüm domain event'ler için.
Event kaybı SIFIR."**

Domain event yayma için iki naif yaklaşım risk taşıyor:

1. **Dual write** (DB write → event bus publish, ayrı işlem): DB commit oldu, ama publish
   network hatasıyla başarısız → event kayıp. Veya tersi: publish oldu, DB rollback
   oldu → "olmamış olay" yayılmış.
2. **Sync handler in transaction**: Event handler'lar DB transaction'ı içinde tetiklenir
   → handler hata verirse iş geri sarılır, performans düşer, locality bozulur, mikroservis
   kapısı kapanır.

Outbox pattern her ikisini de çözer: event'i aggregate'in kendi transaction'ında bir
**outbox tablosuna** yaz. Ayrı bir worker tabloyu okur ve event bus'a publish eder.
Atomicity DB tarafından garanti, "at-least-once" delivery worker tarafından, dedup ise
consumer tarafında.

## Decision

### Şema (bu oturumda yarıdıldı)

```prisma
model OutboxEvent {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  aggregateType String    @map("aggregate_type")
  aggregateId   String    @map("aggregate_id") @db.Uuid
  eventType     String    @map("event_type")
  payload       Json
  createdAt     DateTime  @default(now()) @map("created_at")
  processedAt   DateTime? @map("processed_at")
  retryCount    Int       @default(0) @map("retry_count")
  lastError     String?   @map("last_error")
  @@index([processedAt, createdAt])
  @@map("outbox_events")
}
```

### Worker hot-path partial index (manuel SQL)

Worker query'si:

```sql
SELECT * FROM outbox_events
WHERE processed_at IS NULL
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT $batch_size;
```

Bu sorgunun sürekli ucuz kalması için `outbox_events`'e zaten basılan partial index:

```sql
CREATE INDEX outbox_events_unprocessed_idx
    ON outbox_events(created_at) WHERE processed_at IS NULL;
```

Avantajları:

- Index sadece "henüz işlenmemiş" satırları içerir → küçük kalır.
- İşlenen satırlar `processed_at = now()` set edilince index'ten çıkar → gerçek anlamda
  "kuyruk kuyruk büyümez".
- Tablonun büyük çoğunluğu (geçmiş, processed) zaten arşivlik; index degrade etmez.

### Worker davranışı (A2'de NestJS BullMQ job olarak)

1. Her N saniyede bir (örn. 1s) yukarıdaki SELECT ile bir batch alır.
2. `FOR UPDATE SKIP LOCKED` sayesinde birden çok worker aynı satırı çekemez.
3. Her event'i `EventEmitter2` (in-process) ile publish eder.
   - Faz 2'de Redis Streams'e yükseltme değerlendirilecek (cross-process scaling için).
   - Faz 4'te Kafka değerlendirmesi (event-sourcing'e dönüş yoksa muhtemelen overkill).
4. Başarılı publish → `UPDATE outbox_events SET processed_at = now() WHERE id = $1`.
5. Hata → `UPDATE ... SET retry_count = retry_count + 1, last_error = $error`.

### Retry politikası

- **Exponential backoff:** `delay_ms = base * 2^retry_count` (cap 5dk).
- Max **10 deneme**.
- 10. deneme sonrasında: alert (Sentry critical) + manual intervention. DLQ tablosu
      yerine mevcut tablo + filtre (`retry_count >= 10 AND processed_at IS NULL`) yeterli.
      Operator dashboard'u (admin paneli) bu satırları gösterir; manuel reset veya silme
      kararı insan verir.

### Sıralılık (ordering)

- **Aggregate-level sıralı:** aynı `aggregate_id` için event'ler sırasıyla publish
  edilir. Worker batch'ini publish ederken aggregate_id'ye göre grupla, her grup
  içinde sıralı emit et.
- Cross-aggregate sıralılık YOK (Booking#A'nın event'i Booking#B'nin event'inden önce
  veya sonra gelebilir — tasarım kararı).

### Dedup (consumer tarafında)

- Her event handler **idempotent** olmalı. Sebep: at-least-once delivery + worker
  crash retry → aynı event 2+ kere işlenebilir.
- Pratik kalıp: handler `OutboxEvent.id`'yi (her event'in unique id'si) kendi
  "processed_inbox" tablosunda tutar; varsa skip.
- iyzico **webhook**'ları için ayrı `webhook_dedup` tablosu (Faz 3'te). Webhook event_id
  bu tabloya UPSERT'lenir; conflict varsa "zaten işlendik" döndürülür.

### Domain event yayma API'si (A2'de)

Application service:

```ts
await this.prisma.$transaction(async (tx) => {
  // 1) aggregate write
  const booking = await tx.booking.create({ ... });

  // 2) outbox write — aynı transaction
  await tx.outboxEvent.create({
    data: {
      aggregateType: "Booking",
      aggregateId: booking.id,
      eventType: "BookingCreated",
      payload: BookingCreatedPayload.parse(booking),  // Zod validate
    },
  });
});
```

- Transaction commit oldu → her ikisi var.
- Rollback oldu → ikisi de yok.
- "domain event yayınlamadan tamamlanmış aggregate" durumu **imkansız**.

### Test disiplini

- Test helper: `expectOutboxEvent({ aggregateType, eventType, count })` — DB'den okur,
  beklenen event(ler) var mı doğrular.
- Booking, Payment ve diğer kritik akışlarda her use case için outbox assertion zorunlu
  (lint'te değil, code review'da).

## Consequences

### Pozitif

- Event kaybı sıfır — atomic write garantisi.
- Mikroservis ayrımı yapıldığında bu pattern aynen taşınır (sadece publisher değişir).
- Worker'ı durdurup başlatmak zarar vermez (kalan iş tabloda bekler).
- Partial index sayesinde tablo büyüklüğü performansı bozmaz.

### Negatif / Risk

- **Latency:** event aggregate write'tan ~saniyeler sonra publish olur (worker poll
  süresi kadar). Bu MVP'de sorun değil ama "instant" UX gereken yerde başka mekanizma
  (örn. WebSocket push) lazım. **Mitigation:** in-process subscriber'lar transaction
  commit hook'una takılabilir (LISTEN/NOTIFY veya in-memory dispatcher) — A2'de
  değerlendirilecek.
- **At-least-once duplikasyon:** consumer mutlaka idempotent olmalı. Bunu zorlamak
  developer disiplinine kalıyor. **Mitigation:** test helper + code review + handler
  base class'ta `processedInbox` check.
- **Worker downtime → backlog:** worker uzun süre durursa table büyür. **Mitigation:**
  Sentry alert "outbox lag > 5 dk", BullMQ ile worker high-availability (A2 sonrası
  birden fazla replica).
- **Partial index sadece WHERE filter ile match olunca seçilir:** SQL'i `WHERE
processed_at IS NULL` yazmazsanız büyük index seçilir. **Mitigation:** worker SQL'i
  application service'in tek noktasında, code review zorunlu.

## Alternatives Considered

- **Debezium / CDC** — reddedildi (şu an): Postgres WAL'ı stream'leyen Kafka tabanlı
  araç. MVP için altyapı yükü çok büyük; outbox pattern aynı garantiyi dramatik daha az
  operasyonel maliyetle sağlıyor. Multi-DC veya çok-yüksek throughput'a çıkınca yeniden
  değerlendirilir.
- **Dual write (DB → publish)** — reddedildi: tutarlılık garantisi yok, partial failure
  silent veri kaybı yaratır.
- **Sync in-transaction handler** — reddedildi: handler latency aggregate'in transaction
  süresini şişirir, deadlock riski, mikroservis ayrımına geçişi imkansızlaştırır.
- **Full event sourcing** — reddedildi (şu an): aggregate state'i event stream'den
  rebuild etmek + projeksiyonlar + snapshot + upcasting katmanları MVP karmaşıklık
  bütçesini aşar. Outbox + relational state + audit log iş için yeterli. Faz 4+
  yeniden değerlendirilir.
- **Inline EventEmitter2 publish post-commit (outbox tablosu yok)** — reddedildi:
  process crash anında event kaybı; outbox kalıcı kuyruk garantisi sunuyor.
