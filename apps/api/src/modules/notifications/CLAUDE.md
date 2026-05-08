# Notifications Module (A4e-1 / A4e-2 / A4e-3)

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

## A4e-3 eklemeler (mevcut)

- **PushSenderPort + MockPushSender + ExpoPushSender + factory**
  Factory `EXPO_PUSH_PROJECT_ID` empty / `DUMMY_*` → Mock; real UUID
  → ExpoPushSender (placeholder, A4g'de gerçek gateway).
- **Channel routing** — Listener `pickChannel(customer)` ile
  expoPushToken varsa PUSH, yoksa SMS. Driver tarafı SMS-only kalır
  (driver mobile + push registration A4f'de).
- **`recipientPushToken` Notification row'unda** — SMS rows için null,
  PUSH rows için listener tarafından dolduruluyor. Sender DB hit
  olmadan dispatch eder; admin retry channel mutate ederse fallback
  hedef hala kayıtta.
- **`PATCH /users/me/push-token`** — `UpdatePushTokenUseCase` +
  `UsersController`. shared-types `UpdatePushTokenInputSchema` Zod
  regex `/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/` ile şape doğrulama;
  `null` body explicit clear.
- **PII redaction** `*.expoPushToken` + `*.recipientPushToken` +
  `req.body.expoPushToken` log path'leri (push token write
  capability — leaked token = anyone can send to that device).
- **Push title** kind→title mapping `services/push-titles.ts`
  (Türkçe). Body SMS template ile aynı dosyadan render — ayrı
  `.push.json` format YOK.

## SMS fallback policy (kritik)

Token varsa otomatik PUSH, yoksa SMS — listener'da kararlaştırılır.
Token clear edilirse (`PATCH null`) bir sonraki event SMS'e döner.
Push send başarısız olursa retry/DLQ yine devreye girer (A4e-2 zinciri
channel-agnostic). Kullanıcı hiçbir bildirimi kaçırmaz.

## A4f / A4g'ye devredilenler

- **A4f** — Driver app + driver push registration (driver tarafı şu an
  SMS-only). Aynı `pickChannel` patterni driver context'e genişler.
- **A4g** — Real ExpoPushSender (expo-server-sdk wiring), real
  `EXPO_PUSH_PROJECT_ID`, DeviceNotRegistered cleanup loop, provider
  delivery callback (Expo receipts API → DELIVERED status).
