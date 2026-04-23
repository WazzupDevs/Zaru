# ADR 0010 — OTP Attempt Counter Persistence Across Domain Errors

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

A2c'de `VerifyOtpUseCase` ilk implementasyonunda tüm akış tek bir
`prisma.$transaction(...)` callback'inin içindeydi:

```ts
return this.tx.run(async (tx) => {
  const row = await this.otpRepo.findByIdAndPhone(tx, ...);
  // ...
  const matches = await argon2.verify(row.codeHash, code.value);
  if (!matches) {
    await this.otpRepo.incrementAttempt(tx, row.id);
    throw new InvalidOtpError(...);   // <- transaction rollback
  }
  // success path...
});
```

**Sonuç:** Yanlış kod gönderen istemci için `incrementAttempt` çağrısı
DB'ye yazılıyordu **ama** hemen sonrasında atılan `InvalidOtpError`
Prisma transaction'ını rollback ediyordu. Counter geri alınıyordu.
Saldırgan aynı `requestId` üzerinden sınırsız sayıda 6 haneli kod
deneyebiliyordu — `OTP_MAX_VERIFY_ATTEMPTS=5` korumasını delen bir
**OTP brute force vektörü**.

Aynı pattern `RefreshTokensUseCase`'de de vardı: revoked refresh
replay edilince `revokeFamily` + audit event yazılıyor sonra
`RefreshReuseDetectedError` atılıyordu — rollback cascade revoke'u
da geri alıyordu, reuse detection sessizce kayboluyordu.

E2E suite'in **`wrong code 5 times → 6th returns OTP_ALREADY_CONSUMED`**
testi yazılırken keşfedildi. Test 6. denemenin 409 dönmesini
bekliyordu (5.'de `consume` çağrısı OTP'yi yakmış olmalıydı), ama
hep 400 (yeni `INVALID_OTP`) dönüyordu. Trace: `consume` ve
`incrementAttempt` çağrıları DB'ye ulaşıyor ama commit edilmiyor.

## Decision

**"Accounting" yazımları (attempt bump, reuse cascade, audit event) ana
iş transaction'ından ayrı kısa transaction'lara bölünür.**

`VerifyOtpUseCase` artık üç adım:

1. **tx1 (read-only):** OTP row lookup. Validation hataları (`OtpNotFound`,
   `OtpExpired`, `OtpAlreadyConsumed`) burada — yazım yok, rollback önemsiz.
2. **(no tx):** `argon2.verify` — CPU-bound, DB değil.
3. **Wrong code dalı — tx2a:** `incrementAttempt` (+ max'a ulaştıysa
   `consume`) ayrı kısa tx'te commit. Sonra `InvalidOtpError` atılır.
   Bir önceki tx zaten commit edildiği için throw counter'ı kaybetmez.
4. **Success dalı — tx2b:** `consume` + user upsert + refresh issue +
   4 outbox event tek büyük atomic tx. Burada throw _olabilir_ —
   o zaman tüm success-path yazımları rollback OLMALI (yarım kalmış
   user oluşturmasın).

`RefreshTokensUseCase` aynı pattern: reuse detection durumunda
`revokeFamily` + audit event ayrı tx'te commit, sonra
`RefreshReuseDetectedError` atılır. Rotation happy path tek atomic tx.

## Consequences

### İyi

- **OTP brute force vektörü kapanır.** 5 yanlış deneme sonrası 6.
  attempt için satır `consumed` durumda → `OTP_ALREADY_CONSUMED` (409).
- **Reuse detection persist olur.** Saldırgan revoked token replay
  ettiğinde tüm family revoke + audit log gerçekten DB'ye yazılır.
- **Pattern genelleşebilir.** Webhook dedup counter, rate limit tick,
  audit log gibi tüm "yazımı kaybetmek istemediğin ama domain error
  atabileceğin" use case'ler aynı şablonu kullanabilir.

### Maliyet

- **2 yerine 3 DB roundtrip** verify'da (read + accounting + (success ise) big tx).
  Refresh'te 2 yerine 3 (read + (reuse ise) cascade-tx + (success ise) rotate-tx).
  Saniyede 100 auth denemesi senaryosunda ekstra ~100 DB call —
  PgBouncer'lı bir connection pool için ihmal edilebilir.
- **Anlık tutarsızlık penceresi** verify happy-path'te: `consume`
  başarılıysa ama `refreshRepo.issue` çakışıp throw ederse, OTP zaten
  yakılmış olur ama kullanıcı login olmamış olur. Kullanıcı yeniden OTP
  ister. Kabul edilebilir UX cost (nadir senaryo, kullanıcı 5 sn'de
  yeni OTP alır).

### Test guarantee

`apps/api/test/auth.controller.e2e-spec.ts` içindeki şu iki test bu
ADR'ın **regression guard**'ıdır:

- `invalidates OTP after 5 wrong attempts (6th is consumed/not-found)` —
  attempt counter persist edilmezse 6. attempt yine 400 döner ve test fail
  eder.
- `refresh rotates tokens; reuse triggers family revoke (401)` — reuse
  cascade revoke persist edilmezse rotated-into refresh hâlâ çalışır ve
  test fail eder.

Bu testler kasten oturum brute force ve reuse detection'ı en uçtan
doğrular. Silinmemeli, "flaky" diye disable edilmemeli.

### Revisit trigger

A2c-followup'taki **G6 (OTP rate limit Redis sliding window'a taşıma)**
implementasyonunda: counter hâlâ DB'de mi olmalı, yoksa Redis'e mi
taşınmalı? Eğer Redis'e taşınırsa accounting yazımı atomic Lua
script'iyle yapılır, transaction rollback problemi tamamen ortadan
kalkar. **ADR revisit:** rate limit Redis'e taşındığında attempt counter
da Redis'e taşınsın mı, yoksa "audit trail" amacıyla DB'de kalsın mı?
A2c-followup branch'inde tekrar değerlendirilecek.

## Alternatives Considered

### `try/catch` içinde counter update

```ts
try {
  // verify, throw on wrong code
} catch (err) {
  if (err instanceof InvalidOtpError) {
    await this.otpRepo.incrementAttempt(...); // outside tx
  }
  throw err;
}
```

**Red:**

- Async error yutma riski yüksek — counter update'in kendisi de
  fail edebilir, o durumda hangi error'u throw edeceğiz? İç içe error
  handling kompleks ve okunaksız.
- "Wrong code" haricindeki `OtpExpired`/`OtpNotFound`/`OtpAlreadyConsumed`
  branch'lerinde counter bump istemiyoruz. `try/catch` filtre yapmak
  zorunda — error type'a göre dallanma → daha kırılgan kod.
- "Throw'u algılayıp side-effect yap" pattern'i counter dışında bir
  yazım gerekirse (audit log) tekrar edilmeli. Pattern ölçeklenemez.

### Event-driven (outbox + worker)

`InvalidOtpError` atılırken outbox'a `OtpAttemptFailed` event
yaz, worker bunu okuyup counter'ı bump etsin.

**Red:**

- Aynı API call içinde **read-your-writes** lazım: 6. attempt geldiğinde
  counter'ın 5 olduğunu görmek zorundayız, worker'ın eventually
  process etmesini bekleyemeyiz.
- Outbox event'i de **rollback** problemine düşer (worker kuralı:
  outbox row use case'in main tx'inde yazılır → yine rollback).
- Ekstra worker hop'u gereksiz latency.

### Counter'ı doğrudan Redis'te tut

`INCR otp:attempt:<requestId>` ile atomic counter. DB'de tutmak yerine.

**Red (şimdilik):**

- A2c-followup G6'nın kapsamı (rate limit Redis'e). Bu ADR ondan önce
  geldi. **Sıralama:** önce DB tabanlı counter brute force'u kapatsın
  (acil security fix), sonra G6'da pattern Redis'e taşınır. Premature
  refactor yapma.
- Audit trail için DB'de kalıcı kayıt değerli (zaman içinde "şu
  kullanıcı şu OTP'yi 4 kez yanlış girdi" sorgusu).

### Rotation'ı tek tx'te bırak, refresh use case için ayrı çözüm

Sadece `VerifyOtpUseCase`'i fix'le, `RefreshTokensUseCase`'i tek tx
bırak çünkü reuse detection nadir bir senaryo.

**Red:** Reuse detection nadir ama **kritik**. Saldırgan elindeki
çalınmış token'ı kullanırsa cascade revoke tetiklenmeli — silently
fail etmek "güvenlik tiyatrosu". Aynı pattern her iki use case'de de
uygulanır, tutarlı zihinsel model.

## References

- A2c implementation: `apps/api/src/modules/identity/application/use-cases/verify-otp.use-case.ts`
- Regression test: `apps/api/test/auth.controller.e2e-spec.ts` — "invalidates OTP after 5 wrong attempts" + "refresh rotates tokens; reuse triggers family revoke"
- Related: ADR 0004 (Transactional Outbox) — outbox row aynı tx'te yazılma kuralı, success path için hâlâ geçerli
- Related: ADR 0008 (Refresh Token Rotation) — reuse detection mantığı
