# ADR 0022 — Notification Retry & Dead Letter Queue

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

A4e-1 BullMQ queue + worker zincirini kurdu ama `attempts: 1` ile —
yani provider 5xx alıp atarsa SMS sessizce kaybolur. Network flake +
provider rate limit gerçekçi senaryolar; sessiz kayıp KVKK + müşteri
güveni riskleri.

Tasarım uzayı:

1. **Sonsuz retry** — invalid phone'a sonsuz deneme = quota israfı
2. **Tek attempt + admin manuel retry** — ops yükü, müşteri bekler
3. **Linear backoff** — provider rate limit sonrası hemen tekrar = ban
4. **Exponential backoff + DLQ** — geçici hata otomatik kurtarılır,
   kalıcı hata DLQ'ya

## Decision

**5 attempts × exponential backoff + DLQ table.**

### BullMQ retry config

```ts
queue.add(SEND_NOTIFICATION_JOB, payload, {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnFail: false, // DLQ snapshot için tut
});
```

Backoff sonrası bekleme süreleri (BullMQ exponential 2^n × delay):

- attempt 1 fail → 2 sn sonra retry
- attempt 2 fail → 4 sn
- attempt 3 fail → 8 sn
- attempt 4 fail → 16 sn
- attempt 5 fail → DLQ

Toplam ~30 sn pencere — geçici hata kurtarılır, kalıcı hata 30 sn'de
manuel queue'ya alınır.

### DLQ snapshot

`NotificationDeadLetter` tablosu notification anlık çekim:

- channel, kind, recipientPhone, renderedBody (snapshot — orijinal
  notification sonradan değişebilir, DLQ row sabit)
- finalError, attempts, firstAttemptAt, lastAttemptAt
- attemptHistory (her attempt için error + zaman)
- investigatedAt, investigatedByUserId, resolution (admin audit)

Notification status `DEAD_LETTERED`'a transition. DLQ row UNIQUE
notification_id index — aynı notification 2 kez DLQ'lanmaz (idempotent).

### Outbox event

`notifications.NotificationDeadLettered` outbox'a yazılır — A5+ Slack
veya email pipeline tüketir, ops alarm.

Payload PII-free:

```json
{
  "notificationId": "...",
  "kind": "BOOKING_CONFIRMED",
  "channel": "SMS",
  "attempts": 5,
  "finalErrorClass": "NotificationSendFailedError"
}
```

### Worker akışı

```
process(job)
  ├── attemptNumber = job.attemptsMade + 1
  ├── try: sendUseCase.execute({ notificationId, attemptNumber })
  └── catch:
      ├── if attemptNumber >= maxAttempts:
      │     deadLetterUseCase.execute({ notificationId, finalError, attempts })
      └── throw → BullMQ scheduler next retry per backoff
```

`SendNotificationUseCase` her hata sonrası `appendAttempt` ile journal
yazar (attemptHistory[]); `markFailed` sonra. Worker DLQ kararı
attemptNumber >= max ise alır.

### attemptHistory

Notification row'unda `attempt_history JSONB DEFAULT '[]'` kolonu —
[{attempt, error, attemptedAt}]. Her retry attempt eklenir. DLQ
snapshot bunu kopyalar (mutable kaynak silinse bile DLQ kayıt sabit).

### Admin retry

`POST /admin/notifications/:id/retry` (G5):

- DEAD_LETTERED veya FAILED notification'ı PENDING'e geri çek
- BullMQ'ya yeniden enqueue (jobId aynı)
- attemptHistory + retryCount korunur (audit)

## Consequences

### İyi

- **Geçici hatalar otomatik kurtarılır** — network flake, provider
  rate limit ~30 sn'de geçer, retry başarılı.
- **Kalıcı hatalar DLQ'ya** — invalid phone, provider permanent reject
  → admin görsel queue, manuel investigate + resolve.
- **Audit edilebilir** — attemptHistory + DLQ snapshot her retry'i
  kayıt altına alır, "neden gönderilmedi" sorusuna cevap.
- **Idempotent** — DLQ row UNIQUE notification_id, double-DLQ olmaz.

### Maliyet

- **30 sn worst case latency** — kullanıcı SMS'i geç alır. Booking
  confirm gibi kritik akışta kabul edilebilir; OTP gibi blocking flow
  için yetersiz (OTP attempts=1 + UI fallback).
- **DLQ table büyür** — investigated row'lar archived/silinmeli (Faz
  3 cleanup worker).
- **Memory pressure removeOnFail:false** — failed job'lar Redis'te
  birikir. removeOnFail: { age: 7days } gibi TTL config A4f+'da.

### Riskler

- **Provider quota saldırısı** — invalid number bombing 5 retry × N
  attacks = quota israfı. Mitigation: `dispatch.NotificationSendFailedError`
  içeren error class'ına göre erken DLQ (Faz 3+).
- **OTP retry pencereleri** — OTP TTL 5 dk, retry pencere 30 sn ≪ TTL
  ama backoff bir gönderimde 4 attempt × 2-16s = ~30 sn dolaylı OTP
  validation süresine yakın. Acil: OTP için `attempts: 2` config
  override (Faz 3 review).

## Alternatives Considered

### Sonsuz retry

Reddedildi: Invalid phone permanent → quota israfı + provider ban
riski.

### Linear backoff (her retry +5 sn)

Reddedildi: Provider rate limit'ten sonra hemen tekrar vurur, exponential
adaptive davranır.

### Direct DLQ on first failure

Reddedildi: Network flake çoğu zaman 1-2 sn'de düzelir; tek attempt
kayıp = kullanıcı uvalı.

## Revisit Trigger

- **DLQ rate > %1** — retry policy yeterince agresif değil veya
  provider seçimi yanlış. Operational dashboard'da watch.
- **Multi-provider failover** — Netgsm + İleti Merkezi chain → DLQ
  yerine secondary'ye düş. PrimaryFallbackSmsSender (legacy A2c)
  desen revive.
- **Per-channel retry config** — SMS vs PUSH farklı policy gerekirse
  config per-channel.

## References

- Implementation:
  - `apps/api/src/modules/notifications/application/use-cases/dead-letter-notification.use-case.ts`
  - `apps/api/src/modules/notifications/application/use-cases/send-notification.use-case.ts`
  - `apps/api/src/modules/notifications/infrastructure/workers/notification.worker.ts`
- Schema: `prisma/schema.prisma` (NotificationDeadLetter + attempt_history)
- Migration: `prisma/migrations/20260511000000_add_notification_dlq`
- Cross-ref:
  - ADR 0021 (Notification strategy)
  - ADR 0019 (PII discipline in event payloads)
- Env: `NOTIFICATION_MAX_ATTEMPTS`, `NOTIFICATION_BACKOFF_DELAY_MS`
