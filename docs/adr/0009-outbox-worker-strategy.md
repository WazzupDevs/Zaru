# ADR 0009 — Outbox Worker Strategy

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

ADR 0004 (Transactional Outbox) "domain event'leri `outbox_events` tablosuna
yaz" kararını aldı ama implementasyonu erteledi. A2c boyunca event'ler tabloya
yazıldı, kimse okumadı — `processed_at IS NULL` satırlar birikti. A2c-followup
bu borcu kapatıyor.

İki ayrı tasarım sorusu var:

1. **Tetikleme:** event'leri ne sıklıkla, hangi mekanizmayla okuyacağız?
   (polling vs CDC vs LISTEN/NOTIFY)
2. **Yayım:** okunan event'leri nereye iletiyoruz? (in-process bus vs
   external broker)

## Decision

### Polling + Lua-free SKIP LOCKED

**Polling:** BullMQ repeatable job, 1 saniye periyot. Her tick:

1. `BEGIN`
2. `SELECT ... FROM outbox_events WHERE processed_at IS NULL AND
(next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY created_at
LIMIT 50 FOR UPDATE SKIP LOCKED`
3. Her satır için `eventEmitter.emitAsync(eventType, payload)`
4. Başarılıysa `UPDATE ... SET processed_at = now()`
5. Hatalıysa exponential backoff (`2^retry_count` saniye, max 1 saat)
6. `COMMIT`

**Neden polling:**

- LISTEN/NOTIFY: PostgreSQL native ama Prisma desteği ergonomik değil
  (raw `\$queryRawUnsafe` lazım), connection pool semantiği komplike,
  notification kayıp riski (subscriber down). Hibrit yaklaşım çekici ama
  şu anki ölçek için over-engineering.
- CDC (Debezium): ayrı container + Kafka. MVP için aşırı.
- Polling: basit, observable, BullMQ ile graceful shutdown bedava. 1sn
  latency Faz 1 için kabul edilebilir (event'ler analytics, audit, push
  notification — sub-second şart değil).

**Neden SKIP LOCKED:**

- `FOR UPDATE` tek başına: paralel worker'lar aynı satırı sıraya alır,
  bekler — gereksiz block.
- `SKIP LOCKED`: paralel worker'lar farklı satırları çekebilir,
  conflict-free. Multi-worker'a hazırlık (şimdi tek worker, A4+ scale
  kararı). Tek worker olsa bile bir tick yarım kalırsa (uzun handler) bir
  sonraki tick aynı satırı tekrar lock'lamaya çalışmaz.
- Prisma'nın native `SELECT FOR UPDATE` desteği yok → `\$queryRaw`
  zorunlu. Tek raw SQL noktası, kabul edilen leak.

### Tek worker, concurrency 1

`@Processor(QUEUE_NAME, { concurrency: 1 })` — tek BullMQ worker,
parallel job yok. Sebep:

- Outbox event'lerin **per-aggregate sıralılığı** korunmalı (örn.
  `UserCreated` `UserLoggedIn`'den önce gelmeli). Multi-worker bunu
  garanti etmez (aynı aggregate_id'li event'ler farklı worker'lara
  düşebilir).
- Multi-worker + aggregate_id partitioning (consistent hash → worker)
  doğru çözüm ama implementation karmaşık. Faz 1 throughput'u tek
  worker'la rahat (~50 event/sn batch × 1 batch/sn = 50 event/sn).
- A4+ scale kararı: gerekirse `BullMQ + worker pool + hash-based routing`
  veya `Kafka partitions` değerlendirilir.

### Exponential backoff + abandon

- Retry: `2^retry_count` saniye (1, 2, 4, 8, 16, 32, 64, 128, 256, 512,
  3600 cap). 10 retry → toplam ~17 dakika maximum gecikme.
- 10 retry sonra `processed_at` set edilir + `last_error` korunur, warn
  log atılır. Event "abandoned" — DLQ tablosu yok henüz, manuel
  inspection gerekir. **A4+ TODO:** `outbox_events_dead_letter` tablosu.

### EventEmitter2 in-process bus

- Worker `events.emitAsync(eventType, payload)` çağırır.
- Subscriber'lar Nest'in `@OnEvent("identity.OtpVerified", { async: true })`
  ile dinler.
- Wildcard pattern (`@OnEvent("identity.*")`) namespace seviyesinde
  subscribe imkanı.
- **In-process** — aynı Node process'inde. Modüller arası loose coupling
  ama distributed değil. Faz 2'de notifications/analytics ayrı service
  olursa NATS / Redis Streams değerlendirilir.

### Idempotent emit consumers

Worker `emitAsync` sonra `processed_at` set ediyor → handler bir kez tetiklenir
**eğer** transaction commit ederse. Ama edge case: handler başardı, processed_at
update'i fail (DB connection drop) → bir sonraki tick aynı event'i tekrar emit
eder. **Consumer'lar idempotent olmak zorunda** — kontrat. ADR'da yazılı.

## Consequences

### İyi

- Event delivery **at-least-once**.
- Handler hatası tüm pipeline'ı durdurmaz — ilgili event retry'a girer,
  diğerleri devam eder.
- Graceful shutdown bedava (BullMQ + Nest's `enableShutdownHooks`).
- `processed_at IS NOT NULL` izi **audit trail** — ne zaman, hangi event,
  retry geçmişi.

### Maliyet

- Her tick 1 SQL `SELECT FOR UPDATE` + N `UPDATE` (N = batch size).
  50 event/saniye, ~100 DB write/saniye. Tek instance Postgres rahat.
- Worker down ise event'ler birikir, restart'ta drain eder. Catastrophic
  bekleme yok ama metric ekle: `outbox_lag_seconds = now() -
min(created_at) WHERE processed_at IS NULL`. Grafana A4 setup'ında.

### Riskler

- **At-most-once consumer'lar:** notifications-push gibi "yanlışlıkla 2
  kere göndermek istemediğin" işler için consumer-side dedup tablosu şart.
  A3 supply / A3+ notifications planlandığında pattern dökümante.
- **Worker hata yutarsa:** `try/catch` handler içinde, hata `last_error`'a
  yazılır, throw edilmez. Eğer handler hata yer ve `error` event'ini
  EventEmitter2'ye fırlatırsa, worker process crash edebilir
  (`verboseMemoryLeak: true` zaten warning veriyor). **Defansif:**
  `emitAsync` etrafına try/catch, `last_error`'a yaz.

## Alternatives Considered

### LISTEN/NOTIFY tetikleme

PostgreSQL `NOTIFY` ile event yazılınca worker uyandırma. Avantaj: 1sn
gecikme yerine ms-level. Dezavantaj:

- Prisma adapter LISTEN/NOTIFY desteği zayıf — `pg` raw client gerek.
- Notification kayıp riski (worker connection drop) → polling fallback
  yine şart.
- Hibrit yaklaşım (`NOTIFY for low-latency + polling for safety`) iyi
  pattern ama MVP için karmaşık.

**Şimdi red, A3+ değerlendirme.**

### CDC (Debezium / Kafka Connect)

Postgres WAL → Kafka → consumer'lar. Outbox tablosu bile gerekmez ama:

- Ayrı container (Debezium) + Kafka cluster. Operasyonel maliyet ağır.
- MVP için over-engineering.

**Faz 3+ kararı.**

### EventEmitter2 yerine NATS / Redis Streams

Distributed pub/sub. Avantaj: notifications service ayrı process olduğunda
çalışır. Dezavantaj:

- Henüz tek service var, distributed pub/sub gereksiz.
- EventEmitter2 zaten in-process bus için yeterli.

**Faz 2 (mobil notifications service ayrılınca) revisit.**

### Multi-worker + aggregate_id hash routing

Şu an red (yukarıda gerekçe). A4+ scale kararı.

## Revisit Triggers

- **Outbox lag metric > 30s** sustained → multi-worker veya tetikleme
  mekanizması değişimi (LISTEN/NOTIFY).
- **Abandoned event rate > 0.1%** → DLQ tablosu + alerting.
- **Notifications service ayrılırsa** → distributed pub/sub.

## References

- Implementation: `apps/api/src/common/outbox/outbox-drain.service.ts`
- Worker: `apps/api/src/common/outbox/outbox.worker.ts`
- Scheduler: `apps/api/src/common/outbox/outbox-scheduler.service.ts`
- Integration test: `apps/api/test/outbox-drain.integration-spec.ts`
- Related: ADR 0004 (Transactional Outbox decision)
- Related: ADR 0010 (transaction + domain error → accounting loss) —
  outbox row writes still go in the same tx as the aggregate change.
- [PostgreSQL SELECT FOR UPDATE SKIP LOCKED](https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE)
