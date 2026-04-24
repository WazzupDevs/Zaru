# ADR 0014 — Clock Port Injection

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

A2c'de identity modülü içinde lokal bir `ClockPort` vardı (sadece OTP/refresh
expiry için). Outbox worker, Redis rate limiter, idempotency cleanup ise
direkt `new Date()` / `Date.now()` kullanıyordu.

A2c-followup'tan sonra "**returning-user e2e**" testini yazmak isterken
duvara çarptık: aynı phone'la 2 dakika içinde iki OTP request mümkün değil
(per_minute rate limit). Test'te beklemek = flaky test. Çözüm clock'u test
zamanından kontrol etmek — ama mevcut DI yapısı sadece identity modülünü
kapsıyordu.

## Decision

**Tek bir global `ClockPort`** common altında, her modül inject eder.

```
apps/api/src/common/clock/
  clock.port.ts       — interface + Symbol token
  system-clock.ts     — production impl
  clock.module.ts     — @Global, default useExisting: SystemClock
apps/api/test/fakes/
  frozen-clock.ts     — test impl: set() + advance(ms)
```

### Interface

```typescript
interface ClockPort {
  now(): Date; // fresh Date instance per call
  nowMs(): number; // Date.now() shortcut for hot paths (rate limiter Lua, backoff)
}
```

`now()` her çağrıda **yeni Date** döner — Date mutable, paylaşılan ref
bug'lara açık.

### Test override pattern

```typescript
const clock = new FrozenClock(new Date("2026-04-23T08:00:00Z"));
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(CLOCK_PORT)
  .useValue(clock)
  .compile();

// ... test setup ...
clock.advance(2 * 60 * 60 * 1000); // jump forward 2 hours
// ... assert returning-user behavior ...
```

Nest's `overrideProvider` global ClockModule'un binding'ini değiştirir;
tüm injection point'ler (identity use cases, outbox drain, rate limiter)
fake clock'u görür.

### Refactor scope (yapılan)

- Identity module-içi `ClockPort` silindi, common'dakine taşındı.
- `RequestOtpUseCase`, `VerifyOtpUseCase`, `RefreshTokensUseCase`:
  zaten port-driven, sadece import path değişti.
- `OutboxDrainService`: `new Date()` → `clock.now()` (constructor'a
  CLOCK_PORT inject).
- `RedisSlidingWindowRateLimiter`: `Date.now()` → `clock.nowMs()`.
- **DB tarafı dokunulmadı:** `@default(now())` Prisma defaults, `now()`
  PostgreSQL function. Application clock'a tabi değil — DB write zamanını
  Postgres yazıyor. Bu kasıtlı: DB-side now() audit trail için kanonik
  (drift yok).
- **Logger timestamp dokunulmadı:** pino kendi başına `time()` ekliyor,
  log timeline gerçek zamanın olmalı.

### "Test'te `new Date()` kullanma" kuralı

Application code'da `new Date()` veya `Date.now()` görmek = code review
red flag. Tek istisna: yardımcı util'ler (örn. UUID generation, hash) —
oradaki Date kullanımı semantik değil teknik (entropy source).

## Consequences

### İyi

- **Returning-user e2e mümkün** — A2c'den open TODO kapandı.
- **Future use cases** (booking expiry, document expiry, session timeout)
  ücretsiz test edilebilir.
- **Determinism** — flaky timer testleri artık imkansız.

### Maliyet

- **Constructor parameter sayısı** her clock-aware service için +1.
  Marjinal, her modülde 3-5 ekstra inject vs flaky test debugging
  saatleri.
- **Dev-time discipline** — `new Date()` yazımı yeni use case yazarken
  refleks olabilir. Mitigation: code review, gelecekte custom ESLint
  rule.

### Riskler

- **Distributed timestamp** — multi-region deploy'da clock skew sorun
  olur (bir bölge UTC+3, diğeri UTC). Şu an monolit, tek bölge. ADR
  revisit trigger.

## Alternatives Considered

### `vi.useFakeTimers()`

Vitest'in built-in fake timer'ı. **Red:**

- Sadece `setTimeout/setInterval` kontrol eder, `new Date()` değil
  (ki kullanıyoruz).
- Test-framework'a bağlı, framework değişirse infrastructure değişir.
- Domain code'a "test-aware" sızdırır (test util'a bağlı production
  davranış).

### Globally mock'lanmış Date

`Date = vi.fn(() => mockNow)`. **Red:** prototype pollution, her test
sonrası restore unutulursa cross-test contamination, library code'lar
beklenmedik davranışla karşılaşır.

### Per-module clock

Her modülün kendi `ClockPort`'u (A2c'de identity'de olduğu gibi).
**Red:** A2c-followup'ta outbox + rate limiter kendi clock'ları
yokken `Date.now()` kullandı, integration test edilmesi imkansız oldu.
Tek global port = tutarlılık.

## Revisit Trigger

- **Multi-region deploy** — bölgeler arası clock skew tolere edemediğinde,
  ClockPort impl'i NTP sync'li bir source'a bağlanır veya Redis-tabanlı
  monotonic clock'a geçilir.
- **Real-time / sub-millisecond requirements** — şu an ms precision
  yeterli. High-frequency trading benzeri (gelmeyecek) durum gerekirse
  `nowNs()` eklenir.

## References

- Implementation: `apps/api/src/common/clock/`
- Test fake: `apps/api/test/fakes/frozen-clock.ts`
- Returning-user e2e: `apps/api/test/returning-user.integration-spec.ts`
- Refactored callers: identity use cases, outbox drain, redis rate limiter
