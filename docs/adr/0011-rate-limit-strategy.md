# ADR 0011 — Rate Limit Strategy: Redis Sliding-Window-Log

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

A2c'de OTP rate limit geçici olarak `OtpRequestRepository.countByPhoneSince`

- `countByIpSince` ile, yani **Postgres count(\*)** üzerinden çalışıyordu.
  İki problem:

1. **Performans:** Her `POST /auth/otp/request` 3 ek DB roundtrip
   (phone-minute + phone-hour + ip-minute) — saniyede 100 OTP request
   varsayımıyla 300 ekstra DB read/sn. PgBouncer yokken connection pool
   baskısı, varken bile gereksiz yük.
2. **Doğruluk:** Fixed-window count'un bilinen problemi — pencere
   sınırında 2x burst. Saldırgan dakikanın 59. saniyesinde 1 + bir
   sonraki dakikanın 1. saniyesinde 1 = "1 dakika içinde 2" eline geçer.
   OTP rate limit 60sn/1 ise korumayı atlatır.

A2c'den önce bu DB count yaklaşımını seçmiştik çünkü Redis altyapısı
zaten vardı ama atomic counter implementasyonu (Lua script) yazmak
öncelik değildi. A2c-followup bu borcu kapatıyor.

## Decision

**Sliding-window-log** algoritması, Redis sorted set + Lua script ile.

### Algoritma

Her bucket bir Redis sorted set:

- Key: `rl:<feature>:<scope>:<value>` (örn. `rl:otp:request:phone:+905551234567`)
- Score: timestamp_ms
- Member: `<timestamp_ms>:<random>` (uniqueness için — aynı ms'de iki
  request olabilir, kayıt overwrite olmasın)

Atomic Lua script (single round-trip):

```lua
ZREMRANGEBYSCORE key 0 (now - window_ms)   -- pencere dışı entry'leri sil
count = ZCARD key
if count < limit:
  ZADD key now "<now>:<rand>"
  EXPIRE key (window_seconds + 10)         -- idle key cleanup
  return {1, limit-count-1, 0, oldest_ms}
else:
  oldest = ZRANGE key 0 0 WITHSCORES
  retry_after = ceil((oldest + window_ms - now) / 1000)
  return {0, 0, retry_after, oldest_ms}
```

### Neden Lua

- Redis single-threaded — Lua script atomic. `MULTI/EXEC + WATCH`
  alternatifinden daha temiz, daha hızlı (tek round-trip).
- Race condition kontrolü kod düzeyinde değil, runtime garantisi.
- `SCRIPT LOAD` + `EVALSHA` ile script bytecode tek seferlik gönderilir,
  sonraki çağrılar SHA-1 ile referans verir.

### Reddedilenler kayıt edilmez

Limit aşıldığında yeni entry **eklenmez** (sadece `count >= limit`
kontrolü, sonra `return {0, ...}`). Aksi halde flood saldırısı pencereyi
sürekli ileri iterdi. Sliding-window-log algoritmasının kanonik kuralı.

### Anahtar isimlendirme disiplini

`rl:` prefix tüm rate limit key'leri için zorunlu. Caller'ın
sorumluluğu, port'un değil. Bu sayede aynı limiter port'u başka
semantikler için (örn. queue cooldown) prefix'siz kullanabilir.

OTP rate limit key'leri:

- `rl:otp:request:phone:<phone>` — 60sn / 1
- `rl:otp:request:phone:<phone>:hour` — 3600sn / 5
- `rl:otp:request:ip:<ip>` — 60sn / 3
- `rl:otp:verify:phone:<phone>` — 3600sn / 10

İleride supply, booking, webhook, payment için ayrı `rl:` aileleri.

## Consequences

### İyi

- **Tek round-trip**, atomic. ~0.5ms p99 (Redis localhost).
- **Doğruluk:** sliding window — fixed-window'un 2x burst açığı yok.
- **TTL otomatik:** pencere boyutu + 10sn slack ile idle key'ler
  kendiliğinden silinir. Kalıcı state birikmez.
- **Reddedilenler kayıt edilmez:** flood saldırısı limiter'ı
  "donduramaz".

### Maliyet / kabul edilen trade-off

- **Redis zorunlu dependency.** Zaten vardı (idempotency interceptor,
  health check). Yeni runtime cost yok.
- **Rate limit kayıtları Redis restart'ında kaybolur.** OTP rate limit
  60sn pencere — restart'tan sonra ilk dakika "boş" görünür. Kabul edilen
  trade-off: kalıcı audit trail gerekirse domain event (`OtpRequested`)
  zaten outbox'a yazılıyor; rate limit "anlık enforcement" sorumluluğu.
- **Memory:** Her aktif rate limit anahtarı için sorted set, en kötü
  durumda `limit` kadar entry. `1000 phone × 5 entry × 100 byte ≈
500KB`. İhmal edilebilir.
- **Lua script Redis cluster'da slot'lara dağıtılırsa hash tag**
  (`{key}`) gerekir. Şu an single-instance Redis — gerek yok. Cluster'a
  geçilirse port implementation'ı güncellenir, use case'ler etkilenmez.

### At-most-once ne kadar sıkı?

Sliding-window-log **tam doğru** count verir, fixed/leaky window'un
yaklaşıklarına göre. Kabul edilebilir delta yok.

## Alternatives Considered

### Fixed window counter

```
INCR rl:phone:<phone>:202604231500
EXPIRE rl:phone:<phone>:202604231500 60
```

Basit, hızlı. **Red:** pencere sınırında 2x burst (yukarıda).

### Token bucket

Bucket dolu start → cold start saldırı vektörü (servisi kaldırıp burst
imkanı). **Red.**

### Leaky bucket

Implementation karmaşık (background drain task), gain marjinal. **Red.**

### DB count (mevcut A2c yaklaşımı)

Performans + doğruluk problemleri yukarıda. **Red — bu ADR'ın
varlık nedeni.**

### NestJS Throttler (`@nestjs/throttler`)

Built-in module. **Red:**

- Default storage in-memory — multi-instance deployment'ta tutarsız
  davranış. Storage swap edilebilir ama "Redis adapter" zaten kendi
  yazmak gerekiyor.
- Per-route decorator pattern — bizim use case'imiz domain'de (use
  case execute() içinde phone bazlı). Decorator-only API zorlama.
- Granular control eksik (her endpoint için ayrı dönüş şekli vs).

Port abstraction + kendi Redis Lua impl daha temiz.

## Revisit Trigger

- **Multi-instance Redis cluster.** Şu an single Redis. Cluster'a
  geçilirse `{key}` hash tag pattern'i + Lua script cluster-safe
  yapılması gerekir. Port aynı kalır, impl güncellenir.
- **Distributed rate limiting across regions.** Çoklu bölge deploy'da
  Redis replication latency hesaba katılmalı. CRDT-tabanlı counter
  (Redis Active-Active) veya bölge-yerel limiter + central reconciliation
  değerlendirilir. A4+ kararı.
- **Booking / payment rate limit eklenince** key namespace'leri (`rl:`)
  aynı patterns ile genişletilir. ADR güncelleme gerektirmez —
  yalnızca development-notes'a key listesi eklenir.

## References

- Implementation: `apps/api/src/common/rate-limit/redis-sliding-window-rate-limiter.ts`
- Port: `apps/api/src/common/rate-limit/rate-limiter.port.ts`
- In-memory test fake: `apps/api/test/fakes/in-memory-rate-limiter.ts`
- Lua atomic algorithm: [Redis docs — EVALSHA](https://redis.io/commands/evalsha/)
- Sliding window vs fixed window comparison: [Cloudflare blog](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
