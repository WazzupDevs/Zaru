# Notifications Module (A4e-1)

## Sorumluluk

Outbox event'lerini kullanıcı kanalına (SMS şimdilik) dönüştürmek.
EventEmitter2 listener → BullMQ queue → provider adapter zinciri.

## Akış

```
Outbox row drained
   ↓ (EventBus emitAsync, in-process)
@OnEvent("booking.BookingConfirmed") listener
   ↓
QueueNotificationUseCase
   ├── TemplateRenderer.render(key, locale, vars)  → renderedBody
   ├── repo.findRecentDuplicate (24h idempotency)
   ├── repo.create (status=PENDING)
   └── BullMQ enqueue { notificationId }
   ↓ (worker tick)
NotificationWorker.process(job)
   ↓
SendNotificationUseCase
   ├── repo.findById + status guard
   ├── repo.updateStatus(SENDING)
   ├── SmsSender.send({ phone, message, sourceId })
   └── repo.markSent(providerMessageId, sentAt)
        on error → repo.markFailed(error, failedAt) + throw
```

## Önemli Kurallar

- **Provider abstraction** — `SmsSenderPort` (port) + `MockSmsSender`
  (dev/test, in-memory inbox) + `NetgsmSmsSender` (prod, XML POST).
  Factory env'e bakar: `NETGSM_USERCODE` `DUMMY_` ile başlıyorsa Mock.
  ADR 0018 + ADR 0021.
- **Templates dosya-bazlı** — `infrastructure/templates/<locale>/<key>.txt`,
  `{{variable}}` substitution. NestJS build sırasında `nest-cli.json`
  `assets` ile dist'e kopyalanır.
- **PII discipline** — `recipientPhone` + `renderedBody` plaintext DB'de
  (provider clear-text bekler, audit/replay için lazım), log'da maske
  (`*.recipientPhone`, `*.renderedBody` redaction patterns).
- **Idempotency** — `(sourceAggregateId, kind, recipientPhone)` 24 saat
  pencere içinde duplicate prevention. Aynı event 2 kez emit olursa
  ikincisi mevcut notification'ı geri döndürür.
- **Cross-module read** — Listener `UserRepositoryPort` (Identity) inject
  edip recipient bilgisini fetch eder. Outbox payload PII-free kalır
  (lat/lng/phone yok), bu konvansiyonu Notifications da bozmaz.
- **In-process EventEmitter2** — Faz 3+ multi-instance API'de Redis
  pub/sub'a geçiş gerekir; ADR 0021 revisit trigger.

## Public API

- `SmsSenderPort` — Identity OTP kullanır
- `TemplateRenderer` — Identity OTP kullanır
- `QueueNotificationUseCase` — diğer modüller direkt çağırabilir (ama
  outbox listener olağan yol)

## A4e-2'ye devredilenler

- Push notification adapter (Expo)
- Retry policy + DLQ + max attempts
- Admin monitoring controller (queue depth, failed list, replay)
- Provider delivery callback (DELIVERED status)
- Testcontainers integration spec
