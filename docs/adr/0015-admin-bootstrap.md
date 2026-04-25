# ADR 0015 — Admin Bootstrap Strategy

- **Status:** Accepted
- **Date:** 2026-04-25
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Sistem yeni başladığında **hiç ADMIN yok**. İlk ADMIN'i nasıl yaratırız?

İki ortam, iki farklı problem:

- **Dev/test:** Her `db:nuke && db:up && db:seed` sonrası elle SQL atmak
  yorucu. Sürücü onay e2e testi için ADMIN gerek.
- **Prod:** "Self-register + manual SQL" zayıf güvenlik. Audit trail yok,
  typo riski, replication hassas. Web UI'dan "first admin" ceremony da
  saldırı vektörü açar (first-run state machine, yarış koşulları).

Mevcut OTP flow'u sadece CUSTOMER doğuruyor (ADR 0001). Role yükseltmesi
için ayrı bir mekanizma şart.

## Decision

İki yol — ortama göre ayrılır:

### Dev / test → seed script

`prisma/seed.ts` `BOOTSTRAP_ADMIN_PHONE` env'ini okur. Hard guard:

```typescript
if (process.env.NODE_ENV === "production") {
  console.log("⚠️  NODE_ENV=production — admin bootstrap skipped.");
  return;
}
```

`pnpm db:seed` çalıştırılınca:

- Phone yoksa: "skipping admin seed" log.
- Phone varsa + user yoksa: ADMIN role + `phoneVerifiedAt = now()` ile
  user yarat (OTP bypass — bu user direkt login olabilir).
- Phone varsa + user var + role ADMIN değil: role'ü ADMIN'e güncelle.

`.env.example`'da placeholder var, gerçek değer geliştiricinin `.env`'inde.
Test setup'ı (Testcontainers) bu env'i kendi setup'ında set edebilir.

### Prod → CLI script

`pnpm api:promote-admin <phone>` (`apps/api/scripts/promote-admin.ts`).
Akış:

1. Phone format check (TR mobile E.164).
2. User var mı (`findFirst` + `deletedAt: null`).
3. Yoksa hata: "User must register via OTP first."
4. Varsa role değişimi + outbox event:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  await tx.outboxEvent.create({
    data: {
      eventType: "identity.UserRolePromoted",
      payload: {
        userId: user.id,
        previousRole,
        newRole: "ADMIN",
        promotedVia: "cli",
        promotedAt: new Date().toISOString(),
      },
      // ...
    },
  });
});
```

`promotedVia: "cli"` audit ayrımı için — gelecekte `promotedVia: "api"`
endpoint'i eklenince hangi yolla yapıldığı görünür.

### "İlk admin nasıl atanır?" — bootstrap ceremony

Prod'da ilk admin için:

1. Sürücü/admin adayı uygulamadan OTP ile kayıt olur (CUSTOMER).
2. Geliştirici (SSH/deploy yetkisi olan) sunucuya girer.
3. `pnpm api:promote-admin +905...` çalıştırır.
4. Outbox'ta event oluşur, audit görünür.

"Kim CLI çalıştırabilir?" = "Kim deploy yapabilir?" Solo geliştiricide
= sen. Ekip büyüyünce role separation (deploy ayrı, admin promotion ayrı
mekanizma) A4+.

## Consequences

### İyi

- **Prod'da seed sızıntısı imkansız** — `NODE_ENV` guard + CLI ayrı yol.
- **Audit trail** — her promotion outbox event'i.
- **Bilinçli friction** — ilk admin için SSH gerek; "self-promote via
  endpoint" saldırı yüzeyi yok.
- **Dev e2e** — Testcontainers bootstrap admin'i seed'le hazırlayabilir,
  `/admin/*` endpoint'leri test edilebilir hale gelir.

### Maliyet

- **CLI servere SSH gerektirir** — Coolify gibi managed deploy'larda exec
  shell açmak gerek. A4'te `coolify exec` runbook.
- **Outbox event şu an consume edilmiyor** — sadece audit. Bir gün
  notification listener ("Admin yeni atandı, security@ haberdar et")
  bağlanırsa hazır.

### Riskler

- **CLI argv leak** — phone argv'den geliyor, shell history'de görünür.
  Kabul edilebilir (phone PII düşük seviye, redaction'a dahil değil
  argv'de).
- **Race condition** — iki ekip üyesi aynı user'ı CLI ile promote ederse
  sırayla update olur, son yazan kazanır. Önemsiz (sonuç aynı: ADMIN).

## Alternatives Considered

### Web UI "first admin" onboarding

Reddedildi: first-run state machine (kim ilk girer? signup endpoint mi
ayrı? admin endpoint'leri açık mı?). Saldırı vektörü, race koşulları,
prod'da hata yapması kolay. CLI bilinçli friction'la güvenli.

### Manual SQL

Reddedildi: audit trail yok, typo riski, replication arası zaman farkı
hassas. Outbox event yazımı kasıtlı olarak CLI iç akışında.

### Environment-based admin allowlist

`ADMIN_PHONES=+905551111111,+905552222222` gibi env. Reddedildi: deploy
her admin eklemede gerekli, restart maliyet. Listeyi güncel tutmak zor.

### Identity modülü içine PromoteUserUseCase + admin endpoint

A4+'a ertelenmiş. Şu an admin pool çok küçük (1-2 kişi), endpoint
overhead. Endpoint geldiğinde:

- Caller ADMIN olmalı (RolesGuard).
- Self-promotion engellenmeli (caller ≠ target).
- Audit metadata `promotedVia: "api"` olur.
- Aynı outbox event şeması (subscriber'lar değişmez).

## Revisit Trigger

- **Multi-role sistemleri** (SUPPORT, FINANCE, vs) — CLI tek-rol değil
  flexible. `pnpm api:set-role <phone> <role>` veya endpoint-based.
- **Birden fazla admin atama hızı** — manuel CLI yerine self-service
  panel (SUPER_ADMIN role + dedicated endpoint).
- **Audit gereksinimleri sertleşirse** (KVKK / SOC2) — outbox event'i
  consume eden bir compliance log forwarder gerekir.

## References

- Implementation: `prisma/seed.ts` (seedBootstrapAdmin)
- CLI: `apps/api/scripts/promote-admin.ts`
- Env: `BOOTSTRAP_ADMIN_PHONE` in `apps/api/src/config/env.ts`
- Script: `pnpm api:promote-admin <phone>` (root `package.json`)
- Audit event: `identity.UserRolePromoted` (outbox)
- Cross-ref: ADR 0001 (OTP-only registration default), ADR 0004 (outbox)
