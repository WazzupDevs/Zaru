# ADR 0021 — Notification Strategy: In-Process Listener + BullMQ Queue + Provider Adapter

- **Status:** Accepted
- **Date:** 2026-05-09
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Outbox event'leri (booking confirmed, dispatch fired, vb.) kullanıcıya
ulaşmıyordu. Tasarım uzayı:

1. **Direct send in use case** — domain use case'i SMS provider'ı
   doğrudan çağırır.
2. **Outbox-only consumer** — başka bir worker outbox'tan okur ve SMS
   gönderir.
3. **Message broker (Kafka/RabbitMQ)** — outbox → broker → consumer.
4. **In-process listener + retry queue** — outbox drain
   `EventEmitter2.emitAsync`, listener queue'ya iter, worker provider'ı
   çağırır.

A4a-c boyunca outbox event yazıldı ama tüketici yoktu — stub'a kavuştu.

## Decision

**In-process listener (EventEmitter2) + BullMQ retry queue + provider
adapter (port + factory).**

### Akış

```
Outbox row written (booking/dispatch use case, atomic with aggregate)
     ↓
OutboxScheduler.drainOnce() — tx, FOR UPDATE SKIP LOCKED, batch 50
     ↓
EventEmitter2.emitAsync("booking.BookingConfirmed", payload)
     ↓ (in-process)
@OnEvent("booking.BookingConfirmed") → OutboxNotificationListener
     ↓
QueueNotificationUseCase
  ├── TemplateRenderer.render(key, locale, vars)  → renderedBody
  ├── repo.findRecentDuplicate (24h idempotency)
  ├── repo.create (PENDING)
  └── BullMQ enqueue (jobId=`notification-{id}`)
     ↓
NotificationWorker (BullMQ, concurrency 4)
     ↓
SendNotificationUseCase
  ├── repo.markSending (atomic PENDING → SENDING)
  ├── SmsSenderPort.send({phone, message, sourceId})
  └── repo.markSent (providerMessageId, sentAt)
       on error → repo.markFailed + throw (BullMQ retries)
```

### Provider abstraction (ADR 0018)

- `SmsSenderPort` — domain'e en yakın port
- `MockSmsSender` — dev/test, in-memory inbox + legacy static
  `_testOnlyGetLast/_testOnlyReset` (e2e backwards-compat)
- `NetgsmSmsSender` — prod, XML POST to `/sms/send/xml`
- Factory: `NETGSM_USERCODE` `DUMMY_` ile başlıyorsa Mock — Pricing
  modülündeki `AIzaSy_DUMMY` sentinel ile aynı disiplin

### PII

`recipientPhone` ve `renderedBody` kolonları **plaintext** — provider
clear-text bekler, audit/replay için DB'de tutmak gerek. Log
redaction:

- Pino `redact.paths` `*.recipientPhone` ve `*.renderedBody` ekledi.
- Outbox event payload'ları PII-free kalır (ADR 0019 disiplin
  Notifications'da da geçerli) — listener kendi `UserRepositoryPort`
  fetch eder.

### Idempotency

`(sourceAggregateId, kind, recipientPhone)` üçlüsü 24 saat penceresinde
duplicate prevention. Outbox scheduler retry → aynı event 2 kez emit →
ikincisi mevcut notification'ı geri döndürür. Compound index DB'de.

### Templates

Dosya bazlı: `infrastructure/templates/<locale>/<key>.txt`,
`{{variable}}` substitution. NestJS production build'inde `nest-cli.json`
`assets` `.txt`'leri `dist/`'e kopyalar. 7 Türkçe template:

- `identity.otp_request`
- `booking.confirmed`, `booking.cancelled`, `booking.expired`,
  `booking.driver_assigned`
- `dispatch.new_offer`, `dispatch.booking_cancelled`

Tüm template'ler 160 karakter altında (tek SMS = ekonomik).

### Identity refactor

Identity'nin local `SmsSenderPort + MockSmsSender + NetgsmSmsSender +
PrimaryFallbackSmsSender` (4 dosya) silindi. RequestOtpUseCase
NotificationsModule'dan `SmsSenderPort` + `TemplateRenderer` inject
ediyor. Tek SMS provider çıkış noktası, tek template sistemi.

`IdentityModule ↔ NotificationsModule` circular dep `forwardRef()` ile
çözüldü. NotificationsModule UserRepositoryPort'u Identity'den alır
(cross-module recipient lookup).

## Consequences

### İyi

- **Latency düşük** — outbox row → SMS provider çağrısı: 1-3 saniye
  (drain interval + BullMQ pickup). Kullanıcı rezervasyon onayından
  hemen sonra SMS alır.
- **Durability** — Notification PENDING DB'de + BullMQ persistent queue
  (Redis). Worker crash → queue retry, DB row durmuş.
- **Idempotent** — 24h duplicate window, sourceAggregateId + kind +
  recipientPhone ile.
- **Provider lock-in yok** — Netgsm değişirse adapter değişir,
  callsite'lar dokunulmaz.
- **Template change** kod değişikliği gerektirir ama deploy bağımsız
  veri (A4 sonrası admin UI ile editable yapılabilir).
- **PII discipline korunur** — outbox event payload'larında telefon
  yok; audit-trail SmsSender log'da redacted.

### Maliyet

- **EventEmitter2 in-process** — multi-instance API'de aynı outbox row
  her instance'a emit edilir, race olur. A4e-2 + Faz 3 prod scale'de
  Redis pub/sub'a geçiş gerekir.
- **Template renderer dosya yolu fragile** — `nest-cli.json` `assets`
  config doğru olmazsa prod'da 404. Dist'e kopyalama unutulursa
  UnknownTemplateError. Hot-reload watchAssets:true ekledim.
- **Plaintext in DB** — recipientPhone + renderedBody disk'te clear.
  Audit/replay için lazım ama DB dump exfiltration vektörü. Mitigation:
  log redaction + DB row-level encryption (Faz 3 KVKK).

### Riskler

- **A4e-1 scope inçonçaltıldı** — 4 event'ten 2'si fully wired
  (BookingConfirmed + BookingCancelled customer-side). 2 deferred:
  - BookingExpired — event payload'da customerId yok, Booking lookup
    A4e-2'de
  - dispatch.DriverDispatched — driver phone resolution
    (DriverProfile → User chain) A4e-2'de Supply import edince
- **NetgsmSmsSender canlı test edilmedi** — sadece axios mock'u ile
  unit. Real Netgsm panel hesabı yok. Production deploy öncesi
  staging'de manuel doğrulama şart.
- **Retry policy attempts=1** — provider 5xx olursa kayıp. A4e-2 5x
  exponential backoff + DLQ ekleyecek.

## Alternatives Considered

### Direct send in use case

Reddedildi: tx içi external HTTP çağrısı (ADR 0010 ihlali). DB lock'u
provider HTTP latency'sine katlanır. Ayrıca rollback semantiği bozar
(SMS gönderildi ama booking kayıt başarısız → manuel iade).

### Outbox-only worker (no event bus)

Reddedildi: outbox tablosu zaten generic event log. İçinden notification
filter'ı yapmak performans için OK ama listener pattern daha temiz
(her tüketici kendi event'ine subscribe). EventEmitter2 fan-out
handler-per-event-type — clean code.

### Message broker (Kafka/RabbitMQ)

Faz 4+'a ertelendi: MVP için aşırı altyapı. Multi-instance gerekmedikçe
in-process emit + BullMQ persistent queue yeter. Revisit trigger 100+
events/sec ya da multi-region deploy.

### Notifications-only outbox table

Reddedildi: outbox event'in semantik anlamı (DriverDispatched,
BookingCancelled vs) zengin. Sadece notification ihtiyacı doğan event'i
yakalamak için ayrı tablo gereksiz.

## Revisit Trigger

- **Multi-instance API deploy** (Faz 3 prod scale) — EventEmitter2
  in-process broadcast kalmaz; Redis pub/sub veya BullMQ direct enqueue
  patterns'e geçiş.
- **100+ events/sec** — outbox drain bottleneck olur, Kafka/Redis
  Streams değerlendirilebilir.
- **Provider çoklu** — İleti Merkezi failover, multiple GSM operatörü
  per-region — `PrimaryFallbackSmsSender` decorator pattern (legacy A2c
  şeması) revive edilir.
- **i18n lokal eklemeleri** — `en`, `de` template klasörleri.

## References

- Implementation:
  - `apps/api/src/modules/notifications/`
  - `apps/api/src/modules/identity/application/use-cases/request-otp.use-case.ts` (refactored)
- Schema: `prisma/schema.prisma` (Notification + NotificationChannel/Status/Kind enums)
- Migration: `prisma/migrations/20260509000000_add_notifications`
- Cross-ref:
  - ADR 0004 (Transactional outbox)
  - ADR 0014 (ClockPort)
  - ADR 0018 (External API integration: port + factory + dummy sentinel)
  - ADR 0019 (PII discipline in event payloads)
- Env: `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_SENDER`
