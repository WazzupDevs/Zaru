# Development Notes — Gotcha Defteri

> Bu dosya: `CLAUDE.md` kalıcı kurallar için, `docs/adr/` büyük kararlar için —
> burası küçük workflow tuzakları ve alışkanlık notları için. Solo geliştiricinin
> "bir dahaki sefere unutmayayım" listesi.
>
> Format: tarih + bölüm. En yeni en üstte.

---

## 2026-04-23 — Session A2b

### Yeni root-level `.ts` config dosyası eklediğinizde

`tsconfig.json` → `include` dizisine eklenmeli. ESLint `projectService` ile parse
ederken include dışındaki dosyaları "file not in project" diye reddeder ve commit
hook fail eder. Örnek: `vitest.config.ts` (A2a), ilerideki `playwright.config.ts`,
`tsup.config.ts` vs.

### Yeni bir app/paket eklediğinizde

`pnpm-workspace.yaml` `apps/*` ve `packages/*` glob'larına bakar — yani standart
yerlere koyduğunuz bir şey otomatik algılanır. Ama özel path varsa (örn.
`tools/cli/`) manuel ekleme şart. Yeni paketten import etmeden önce bir
`pnpm install` koşmak da unutulmamalı; pnpm symlink'i kurmadan TS resolve edemez.

### Turbo `globalEnv` env var passthrough

Turbo 2.x cache'i deterministik tutmak için `globalEnv` (veya task-level `env`)
listesinde olmayan env var'ları sub-process'e **geçirmez**. Lokalde `.env`
dosyasından okuyan kütüphaneler (Nest ConfigModule gibi) etkilenmez. Ama CI'da
runner env var'larıyla beslenen tasklar fail eder.

**Kural:** Yeni env var ekleyince:

1. `.env.example` güncelle.
2. `apps/api/src/config/env.ts` Zod schema'sına ekle.
3. `turbo.json` `globalEnv` dizisine ekle.
4. CI workflow'unun `env:` bloğuna ekle (gerekiyorsa).

A2a fix commit: `84c538c fix(ci): pass database and redis URLs through turbo globalEnv`.

### Prisma + pnpm hoist

`.npmrc`'de `public-hoist-pattern[]=*prisma*` ve `@prisma/*` zorunlu, yoksa
Prisma CLI workspace içinden `@prisma/client`'ı resolve edemiyor (postinstall
döngüsünde fail). A2a'da keşfedildi.

A2b'de Prisma'yı `apps/api/prisma/` altına taşıma TODO'su ertelendi (bu çözüm
hoist sayesinde stable).

### `prisma migrate dev` non-interactive shell'de çalışmaz

TTY ister. Workaround:

```
pnpm prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql
```

Manuel migration klasörü yarat (`prisma/migrations/<ts>_<name>/migration.sql`),
SQL'i içine koy, gerekiyorsa manuel SQL ekle (CREATE EXTENSION, partial index
gibi DSL'in karşılayamadıkları), sonra:

```
pnpm prisma migrate deploy --schema prisma/schema.prisma
```

A1'de keşfedildi, akış 3 migration'da kullanıldı: `_init`, `_add_uuidv7`,
`_add_otp_requests`.

### Vitest + NestJS DI: SWC plugin zorunlu

`unplugin-swc` + `@swc/core` `vitest.config.ts`'de aktif olmazsa
`emitDecoratorMetadata` çıktısı eksik kalır → `ConfigService` gibi inject'ler
runtime'da `undefined`. A2a'da DomainExceptionFilter ve PrismaService DI
fail'leriyle keşfedildi. ADR 0007 bunun gerekçesi.

### Prisma soft-delete extension'ın handle ETMEDİĞİ durumlar

A2b'de eklenen `softDeleteExtension` şunları handle eder:
`findMany`, `findFirst`, `count`, `delete` → soft-delete filter veya soft-delete
çevrimi.

**Handle ETMEDİĞİ:**

- `findUnique` — Prisma'nın `where` argümanı yalnızca unique alan kabul eder;
  `deletedAt: null` filtresi ekleyemezsiniz. **Çözüm:** soft-delete'a tabi
  modellerde `findFirst({ where: { id, deletedAt: null } })` kullanın. Veya
  schema'da partial unique index (örn. `users_phone_e164_active_unique`).
- `update` — soft-deleted bir satırı kazara update edebilir. **Çözüm:** use
  case'lerde `where: { id, deletedAt: null }` ile manuel guard.
- `deleteMany` — bulk soft-delete A2c veya sonrası. Şimdilik kullanmayın.
- "Silinenleri görmek" için escape hatch yok — gerekirse `prisma.$queryRaw`
  veya extension'ı bypass eden ayrı service.

### Idempotency interceptor endpoint-level, GLOBAL DEĞİL

A2a'da yanlışlıkla `APP_INTERCEPTOR` olarak global kayıtlıydı. A2b'de
endpoint-level `@UseInterceptors(IdempotencyInterceptor)` decorator'ına
indirgendi. Sebep: idempotency mantıklı endpoint'lere (POST /bookings,
POST /auth/otp/request, POST /payments) opt-in olmalı. Tüm GET'lere
veya internal endpoint'lere uygulamak Redis kilit gereksiz baskı.

### Outbox event'i use case'in ana transaction'ı içinde

ADR 0004'ün uygulama kuralı: domain event yayan use case
`prisma.$transaction(async tx => { await repo.create(tx, ...); await tx.outboxEvent.create({ ... }); })`
şeklinde repo + outbox'ı **aynı** transaction'da yazar. Atomicity garanti.

In-memory event bus (EventEmitter2 / Nest CQRS) bu aşamada **yok** — outbox
worker (A2c) tabloyu okuyup publish edince in-process subscriber'lar
tetiklenecek. İki kaynak yok.

### Prisma transaction + domain error → accounting loss tuzağı

Bir use case'de "persist etmen gereken bir accounting yazımı" (retry counter,
audit log, rate limit tick, reuse-detection cascade revoke) ve
"atabileceğin bir domain error" varsa, bu ikisi aynı transaction'da
**OLMAMALI**. `throw` Prisma transaction'ını rollback eder, kaydın gider.

**Pattern:** accounting yazımını ayrı kısa transaction'a koy, throw'dan
ÖNCE commit et; ana iş başka transaction'da dursun.

```ts
// Yanlış:
return this.tx.run(async (tx) => {
  await repo.bumpCounter(tx, ...);   // bu rollback olur
  if (somethingBad) throw new DomainError();
});

// Doğru:
await this.tx.run(async (tx) => {
  await repo.bumpCounter(tx, ...);   // commit edildi
});
if (somethingBad) throw new DomainError();
```

Örnekler:

- **OTP attempt bump** (ADR 0010) — A2c'de keşfedildi ve fix'lendi.
  Brute force vektörünü kapatan kritik fix.
- **Refresh reuse cascade revoke** (ADR 0010) — aynı pattern, security
  audit kaybolmasın.
- **Webhook dedup counter** — gelecek (payment iyzico webhook'ları).
- **Rate limit counter** — DB tabanlı kaldığı sürece.

Supply / booking modüllerinde benzer pattern gelecek (örnek: booking
state transition fail olursa attempt audit log persist olsun).
Yeni use case yazarken refleks olarak sor: "throw ediyor muyum? evetse
counter/log/cascade write'larım ayrı tx'te mi?"

Eğer rate limit veya counter Redis'e taşınırsa atomic Lua script
problemi tamamen çözer (rollback semantiği yok). ADR 0010 revisit
trigger.
