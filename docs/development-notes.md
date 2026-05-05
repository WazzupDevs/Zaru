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
- **Rate limit counter** — A2c-followup'ta Redis'e taşındı, atomic Lua
  script problemi tamamen çözüyor (rollback semantiği yok).

Supply / booking modüllerinde benzer pattern gelecek (örnek: booking
state transition fail olursa attempt audit log persist olsun).
Yeni use case yazarken refleks olarak sor: "throw ediyor muyum? evetse
counter/log/cascade write'larım ayrı tx'te mi?"

### RxJS interceptor nested observable tuzağı

`from(Promise<Observable>)` doğrudan stream'e çevrilmez; içeriden çıkan
`Observable`'ı handle etmek için `from(promise).pipe(mergeMap(obs => obs))`
pattern'i gerekir. A2b idempotency interceptor'ında bu unutulduğunda Nest
inner observable'ı body olarak serialize etti ama subscribe etmedi → testte
"replay" yerine her seferinde yeni handler çalıştı.

İlişkili: idempotency persist + lock release sırası **fire-and-forget değil**.
`tap` yerine `concatMap(async body => { await persist(); await release(); return body; })`
kullan — aksi halde 2. request 1. request'in persist'i tamamlanmadan girer
ve `requestHash` collision algılayıp yanlışlıkla 409 döner.

---

## 2026-04-23 — Session A2c

### Volta pin uyumluluğu

Repo `volta.node = "20.18.0"` pin'liyor (root `package.json`). Volta yüklü
makinede repo dizinine girince otomatik switch olur. Volta yoksa `.nvmrc` +
`engines.node` düşer. CI'da `actions/setup-node` `node-version` env'i
20.18.0 olduğu için ABI tutarlılığı garanti.

Yeni Node minor sürümüne geçerken: hem `volta install node@<x.y.z>` +
`volta pin node@<x.y.z>` koş, hem `.nvmrc` güncelle, hem `apps/api/package.json`
`engines.node` güncelle, hem `.github/workflows/ci.yml` `NODE_VERSION` güncelle.
Üçü senkron olmalı.

### `_testOnlyGetLastOtp` helper'ı

`MockSmsSender` test ortamında gönderilen son OTP'yi memory'de tutar; e2e
testler bu yardımcıdan plaintext code'u alır (DB'de sadece `argon2id` hash
var). Helper sadece `NODE_ENV === "test"` veya `NODE_ENV === "development"`'da
çalışır; production'da çağrılırsa throw eder. Production'da gerçek
`NetgsmSmsSender` SMS atar, plaintext kimsede yoktur.

---

## 2026-04-24 — Session A2c-followup

### BullMQ `maxRetriesPerRequest: null` zorunluluğu

`@nestjs/bullmq` ile Redis bağlantısı kurarken `connection` config'inde
**`maxRetriesPerRequest: null`** olmazsa BullMQ queue create anında
"Using the maxRetriesPerRequest is not supported" hatası atar. ioredis
default'u 20 — BullMQ explicit `null` (sınırsız) bekliyor. Nest
ConfigModule + `BullModule.forRootAsync` factory'sinde unutmamak için
`QueueModule` içine yorum bırakıldı.

### Rate limiter anahtar isimlendirme disiplini

Tüm rate limit Redis key'leri `rl:` prefix'iyle başlar. Caller'ın
sorumluluğu (`apps/api/src/modules/identity/application/use-cases/
request-otp.use-case.ts` örneğine bak), port'un değil. Aktif key
aileleri:

- `rl:otp:request:phone:<phone>` — 60sn / 1
- `rl:otp:request:phone:<phone>:hour` — 3600sn / 5
- `rl:otp:request:ip:<ip>` — 60sn / 3
- `rl:otp:verify:phone:<phone>` — 3600sn / 10

Yeni domain (supply, booking, webhook, payment) için: `rl:<feature>:
<scope>:<value>`. Aynı port impl'i (Redis Lua) tüm aileler için
çalışır — fresh limiter implementasyonu yazma.

### Outbox worker test izolasyonu

`outbox-drain.integration-spec.ts` Testcontainers Postgres'i auth e2e
ile paylaşıyor. Auth test'leri çalıştığında 5 identity event (OtpRequested,
OtpVerified, UserCreated, UserLoggedIn, RefreshTokensIssued) outbox'a
yazılıyor. Drain spec `beforeEach`'te **TÜM `outbox_events` satırlarını
sil** (`deleteMany({})`) — `eventType: { startsWith: "test." }` filter'ı
yetmiyor çünkü drainOnce() tüm pending'i çekiyor. Pattern: pending state
ölçen entegrasyon testleri kendi tablosunu beforeEach'te wipe etmeli.

### Outbox worker — gerçek BullMQ vs `drainOnce()` direkt çağrı

Worker class (`OutboxWorker`) BullMQ Processor decorator'ıyla; gerçek
iş `OutboxDrainService.drainOnce()`'da. Test'ler **service'i direkt
çağırır** — BullMQ scheduler'ı / worker loop'u test etmiyor (BullMQ
sorumluluğu). Bizim sorumluluğumuz: drain mantığı (read + emit + commit

- retry + abandon). Bu ayrım test'leri deterministic yapıyor — fake
  timer yok, polling yok.

### `Prisma.sql` raw query

`SELECT ... FOR UPDATE SKIP LOCKED` Prisma client API'sinde yok —
`tx.\$queryRaw<RowType[]>(Prisma.sql\`...\`)`ile yazılır.`Prisma.sql`
template tag SQL injection'ı önler (parametreleri prepared statement'e
çevirir). Tek raw SQL leak noktası outbox worker — kabul edilen ORM
escape hatch.

Aynı pattern booking dispatch matching (PostGIS distance query),
catalog category filter (jsonb operator), payment reconcile (window
function) için tekrarlanacak. Her seferinde yorum satırı bırak: "Why
raw: <X> is not expressible in Prisma DSL".

---

## 2026-04-23 — Session A3a

### ClockPort her yerde inject — `new Date()` yasak

`apps/api/src/common/clock/` altında global ClockPort. Identity, outbox
worker, rate limiter — hepsi `clock.now()` / `clock.nowMs()` çağırır.
Application code'da `new Date()` veya `Date.now()` görmek = code review
red flag. ADR 0014.

İstisna: DB-side timestamp'ler (Prisma `@default(now())`) ve logger
timestamp'i (pino kendisi koyar). Audit trail için DB now() kanonik —
clock injection oraya sızdırılmaz.

Test override:

```ts
const clock = new FrozenClock(new Date("2026-04-23T08:00:00Z"));
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(CLOCK_PORT)
  .useValue(clock)
  .compile();
clock.advance(2 * 60 * 60 * 1000);
```

### Returning-user e2e izolasyon kuralları

Aynı phone'la iki kez login eden e2e (Testcontainers Postgres + shared
Redis):

1. **Phone'u diğer suite'lerle ÇAKIŞTIRMA** — auth.controller.e2e
   `+905559001001`'i kullanıyor; returning-user `+905559009001`'e geçti.
   Yoksa Redis rate limit kalıntısı 429 üretir.
2. **`beforeEach`'te Redis `rl:otp:*` key'lerini temizle.** Test'ler
   arası Redis state taşması rate limit decision'ları bozar.
3. **Tablo cleanup sırası:** RefreshToken → OtpRequest → User (FK).
   OutboxEvent ayrı (FK yok ama ilgili aggregate'lere göre filtrele).

Pattern dosyası: `apps/api/test/returning-user.integration-spec.ts`.

### Polymorphic Catalog: scope=VEHICLE vs scope=BOOKING attribute'lar

CategoryAttributeDefinition iki farklı yere bağlanır:

- `scope=VEHICLE` → `Vehicle.attributes` JSONB. Sürücü araç register'larken
  doldurur (renk, klima, vs).
- `scope=BOOKING` → `Booking.attributes` JSONB. Müşteri rezervasyon
  yaparken doldurur (tören yeri, kiralama saati, vs).

Aynı kategori için her iki scope'tan attribute olabilir. Vehicle register
ve Booking create use case'leri ayrı Zod schema üretir (definition'ları
filter scope'a göre). A3b/A4 implementasyonu için template hazır:
`apps/api/src/modules/catalog/CLAUDE.md`.

### Seed script Prisma `generator client { seed = ... }` ile değil, package script ile

Schema'da `seed` directive yerine root `package.json`'a `"db:seed": "tsx
prisma/seed.ts"` eklendi. Sebep: schema'daki seed config'i sadece
`prisma db seed` komutunu yapılandırır; biz `pnpm db:seed` ile direkt
çağırıyoruz, daha şeffaf. Ayrıca `seed` directive Prisma'nın migrate
reset akışıyla otomatik tetiklenir — istemediğimiz bir yan etki
(reset = migration replay, seed her zaman istemiyoruz).

`tsx` runner root devDep olarak eklendi (`tsx@^4`).

### Catalog seed: idempotent, upsert tabanlı

`prisma/seed.ts` her şeyi `upsert` yapıyor (slug bazlı). Re-run güvenli.
Production'da `pnpm db:seed` çalıştırılırsa wedding-car kategorisi
zaten varsa dokunmaz — production "shipped categories" için de bu seed
geçerli (tek vertical başlangıçta, A4'te admin panelden eklenir).

### Next.js workspace integration: `transpilePackages`

Admin app `apps/admin` `@event-fleet/shared-types` paketini import
ediyor. Workspace symlink'i `dist/` ESM'i işaret ediyor. Next 15
default bundler bunu transpile etmez → import resolution fails.
Çözüm: `next.config.js` `transpilePackages: ["@event-fleet/shared-types"]`.

Yeni workspace package eklendiğinde admin'den import edilecekse listeye
eklenmesi şart.

### `apps/admin` lint: Next.js kendi config'iyle

Root `eslint.config.mjs` flat config sadece `apps/api/**` glob'unu
hedefler. Admin'in kendi `.eslintrc.json` (legacy format, `next lint`
zorunlu kıldığı için) `next/core-web-vitals + next/typescript`
extends'leriyle çalışır. `pnpm -r lint` her workspace'in lint
script'ini çağırır → admin için `next lint --max-warnings=0`.

Next 16'da `next lint` deprecated; CLI'a geçiş gerektiğinde admin
ESLint config flat'a taşınır, root flat config'in admin scope'u eklenir.

### tsx + tsconfig.json yeni include

Root'a `prisma/seed.ts` eklendi. Eğer ileride root tsconfig include
dizisinde `prisma/**` yoksa, ESLint projectService eklenirse "file not
in project" hatası gelir. Şu an root-level tsconfig.json yok (her
package kendi tsconfig'ini yönetiyor); seed dosyası `tsx` ile çalışıyor
(kendi internal tsconfig). ESLint root flat config seed'i lint etmiyor
çünkü `apps/api/**` ve `packages/shared-types/**` dışında — kabul.

---

## 2026-04-25 — Shared-types dual-format hotfix

### Problem

`packages/shared-types` ESM-only yapılandırılmıştı (`"type": "module"` +
`exports.import` sadece). Vitest (ESM-native) testlerde sorunsuz çalışıyordu,
ama `pnpm --filter @event-fleet/api dev` runtime'da CJS loader kullandığı için
`ERR_PACKAGE_PATH_NOT_EXPORTED` atıyordu:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
.../shared-types/package.json
    at packageExportsResolve (node:internal/modules/esm/resolve:594:13)
    ...
    at Object.<anonymous> (apps/api/src/modules/catalog/domain/value-objects/slug.vo.ts:1:1)
    at Module._compile (node:internal/modules/cjs/loader:1469:14)
```

CI'da yakalanmadı çünkü integration test'ler de Vitest üzerinden ESM'de
koşuyor — gerçek `nest start` runtime sadece `pnpm dev` ile devreye giriyor.

### Çözüm

tsup ile dual-format build (ESM + CJS aynı paket içinde). `exports` field'ı
`import` ve `require` koşullarına ayrıldı; consumer hangi modül sistemini
kullanıyorsa Node otomatik doğru dosyayı seçer.

```
dist/
  index.js / index.cjs / index.d.ts / index.d.cts (+ source maps)
  common/index.{js,cjs,d.ts,d.cts}
  identity/index.{js,cjs,d.ts,d.cts}
  errors/index.{js,cjs,d.ts,d.cts}
```

`"type": "module"` korundu (silmek istemiştik ama tsup `.js` ESM yazdığı
için Node'un extension lookup'ı ile uyumlu kalması şart). `.cjs` extension
zaten CJS olarak okunuyor.

### tsup config gotcha'ları

1. **Default outExtension `.mjs`** — `outExtension: ({ format }) => ({ js:
format === "cjs" ? ".cjs" : ".js" })` ile `.js` zorla.
2. **DTS build TS5074 (`incremental` flag)** — base tsconfig `incremental:
true` veriyor, tsup'ın internal dts builder reddediyor. Çözüm:
   `tsconfig.tsup.json` ayrı dosya, `incremental: false` + `module: "ESNext"`
   - `verbatimModuleSyntax: false` (sadece dts emit için kullanılıyor).
3. **Dual-format çıktıyı manuel test:**

   ```bash
   node -e "console.log(Object.keys(require('./dist/index.cjs')).length)"
   node --input-type=module -e "import('./dist/index.js').then(m => console.log(Object.keys(m).length))"
   ```

### Yan etki: pnpm overrides

tsup install transitif olarak `cosmiconfig-typescript-loader` getirdi
(peer `@types/node ^25`). pnpm bu peer'ı resolve etmek için iki
`@types/node` versiyonu (20 + 25) kurdu, vite/vitest plugin tipleri
çakıştı (`vite@5.4.21_@types+node@25.6.0` vs `_@types+node@20.19.39`).

**Çözüm:** root `package.json` `pnpm.overrides`:

```json
"@types/node": "20.17.0",
"typescript": "5.6.3"
```

TypeScript pin de gerekti — pnpm reinstall sırasında 5.9.3'e zıpladı,
Prisma client + 5.9 yeni inference birlikte `findMany.select` zincirinde
`never` türüne düşüyordu. 5.6.3 stable.

### Geleceğe not

- Yeni paket (config hariç) için aynı tsup pattern kopyala.
- NestJS Nest 11 ile ESM-first oluyor; o ana kadar dual format en güvenli.
- `"type": "module"` kalsın; tsup `.cjs` ile beraber tutarlı.

### CI gap

Bu sorun lokal `nest start` ile ortaya çıktı, CI yakalayamadı. A4 öncesi
CI'a "prod build smoke" job eklenecek: `pnpm build && pnpm --filter api
start --port 0` 5 saniye, healthz check. CI gap kapanır.

---

## 2026-04-24 — Session A3b

### S3 presigned PUT Content-Length imzası

`getSignedUrl(PutObjectCommand({ ContentLength: maxSizeBytes }))` —
Content-Length URL imzasına dahil. Client 16 MB dosyayı 15 MB limit ile
yüklemeye kalkarsa S3 400 döner. "Client'a güvenelim" değil "imza zorla"
kuralı. Test: `storage.integration-spec.ts` oversize senaryosu bu davranışı
doğrular.

### MinIO `forcePathStyle: true` zorunlu

MinIO hostname-style URL'i desteklemiyor. R2 her ikisini de kabul ediyor
(env default: `STORAGE_FORCE_PATH_STYLE=true`). Aynı config, iki provider.

### Testcontainers MinIO spin-up

`setup-integration.ts` globalSetup'ta postgres + redis + minio üçünü de
boot ediyor. MinIO container'ı `quay.io/minio/minio:RELEASE.2024-10-13...`
(image pinned). Test bucket + anonymous download policy `S3Client` ile
JS'de kurulur (mc binary yerine) — daha portable, testcontainer lifecycle
ile uyumlu.

### Prisma + @prisma/client ile cross-module write

`supply.ApproveDriverUseCase` içinde `tx.user.update({...})` ile identity
tablosuna yazıyoruz (User.role → DRIVER). Aynı transaction → atomik.
Event-driven alternative "APPROVED ama henüz promote edilmedi" penceresi
yaratır (outbox worker bir sonraki drain'e kadar). Kasıtlı istisna; her
cross-module write YORUM ile gerekçelendirilmeli. ADR 0005 § "Revisit
trigger": bu pattern kontrolden çıkarsa identity'ye
`PromoteUserRoleUseCase` port'u ekleriz.

### PII disiplini (KRİTİK)

TCKN ve IBAN plaintext HİÇBİR yerde kalıcı değil:

- **DB:** sadece `national_id_hash` (HMAC-SHA256) ve `iban_hash` (argon2id).
  `iban_last4` display için ayrı kolon, plaintext TCKN için display yok.
- **Event payload:** hash bile YOK, sadece id + isim + last4.
- **Response DTO:** mapper'lar (`driver-profile.mapper.ts`) sadece safe
  alanları geçirir. Response'a PII eklenirse smoke assertion kırılır.
- **Log:** pino redaction `*.nationalId`, `*.iban`, `*.nationalIdHash`,
  `*.ibanHash`, + body-level path'ler. Hash bile görünmesin (`ibanHash`
  eski PII bağlantısı tutar).

ADR 0016 — kuralın gerekçesi. Bu kural booking (PII yok ama wallet/payout
IBAN görür), messaging (IBAN regex mask) için de geçerli.

### Attribute validator application layer'da

İlk attempt `domain/services/` altına koydum ama `AttributeDefinitionRecord`
tipi `catalog/application/ports/` altında — domain → application import
ESLint ADR 0005 guard'ı engelliyor (doğru davranış). Taşındı:
`supply/application/services/attribute-validator.ts`. Genel kural: bir
domain service dış modülün application record'unu consume ediyorsa
application layer'da yaşamalı, domain'de değil.

### VehicleType reverse relation

`VehicleType` modeline `vehicles Vehicle[]` back-ref eklendi (Prisma
schema consistency için). Migration'da ek kolon yok — sadece ORM-side.
Bu her yeni relation için hatırlanması gereken bir şey: karşı tarafın
array referansını unutma, yoksa Prisma "has-many" uyarısı verir.

### DriverProfile user_id: @unique + partial unique index

`@unique` Prisma DSL'i total unique constraint kurar (soft-delete dahil).
Ancak aynı user yeniden profile açabilir mi (silinen önceki kayıttan
sonra)? İleride KVKK silme → yeniden kayıt senaryosu için partial unique
index eklendi (`WHERE deleted_at IS NULL`), total unique constraint'ten
**daha gevşek**. Prisma DSL'in `@unique`'i silinen satırları da görüyor;
bu iki katmanlı garanti:

- Aktif row'lar partial index ile unique.
- Eski soft-deleted row'lar unique değil — silinmiş user revive edildiğinde
  yeni profile açabilir.

Şu an total `@unique` konstrainti varken partial de var → migration SQL'de
`ALTER TABLE DROP CONSTRAINT` ile total'i kaldırabiliriz ama A4'e ertelendi
(şu an soft-deleted user yok, sorun yok). Gelecekte KVKK silme flow'u
bunu triggerlar.

### PersistenceModule promotion

Identity'den aldığımız `TxRunnerPort` + `OutboxWriterPort` common/persistence'e
promote edildi. Supply (ve tüm gelecek modüller) aynı ports'u inject eder,
tek implementation. Aynı zamanda `TxClient` tipi de `common/persistence/
tx-client.ts`'te. Identity ports artık TxClient'ı oradan import ediyor.
Cross-module port paylaşımı = common/\* altında, module-specific kalır
module altında.

---

## 2026-04-25 — Session A3c

### Half-open `[start, end)` interval kuralı

Vehicle availability overlap kontrolünde half-open kullandık: `[10:00, 12:00)`
ile `[12:00, 14:00)` çakışmaz (adjacent ranges OK). Standart "iş takvimi"
modeli — biri 12:00'de bitince diğeri 12:00'de başlayabilir. Prisma DSL'de:

```ts
where: {
  startAt: { lt: endAt },     // existing.startAt < requested.endAt
  endAt: { gt: startAt },     // existing.endAt > requested.startAt
}
```

Eşitlik bilinçli olarak yok. PostgreSQL `tstzrange(start, end, '[)')` aynı
semantik — gelecekte GiST index ile değiştirilirse aynı sonuç.

### `tstzrange` + `&&` overlap operatörü (revisit triggeri)

Şu an availability conflict sorgusu B-tree composite index ile çalışıyor
(`vehicle_id, start_at, end_at`). PostgreSQL'in native `&&` operatörü ile
range query daha okunaklı ama:

- `tstzrange(start_at, end_at, '[)') && tstzrange($1, $2, '[)')` — GiST
  index gerek (`btree_gist` extension + composite GiST).
- Şu an N << 10K availability/vehicle. B-tree yeterli.
- Revisit: per-driver 1000+ availability rows veya milisaniye altı latency
  gerektiğinde GiST'e geç + extension yükle.

### Bucket auto-ensure idempotency

S3 SDK `CreateBucketCommand` **idempotent değil** — bucket varken
`BucketAlreadyOwnedByYou` veya `BucketAlreadyExists` throw eder. Pattern:

```ts
async ensureBucket() {
  try { await client.send(new HeadBucketCommand({Bucket})); return; }
  catch (err) { if (!isNotFound(err)) throw err; }
  try { await client.send(new CreateBucketCommand({Bucket})); }
  catch (err) { if (!isAlreadyOwned(err)) throw err; }
}
```

Iki try/catch — HeadBucket önce (race condition'da gereksiz CreateBucket
'ı atlatır), CreateBucket de safe. Production'da skip — bucket DevOps
provision eder.

### Seed admin bootstrap NODE_ENV guard

`prisma/seed.ts`'de admin user yaratımı `NODE_ENV === "production"` kontrolü
ile koruma altında. Production'da `pnpm db:seed` admin yaratmaz, sadece
warn log emit eder. Prod admin için `pnpm api:promote-admin <phone>` CLI.
ADR 0015.

### Promote admin CLI ESLint exclusion

`apps/api/scripts/promote-admin.ts` `tsx` ile çalışıyor, herhangi bir
tsconfig include'ında değil — root `eslint.config.mjs` ignore'una
`apps/api/scripts/**` eklendi (seed.ts ile aynı pattern, A3a precedent).

### Cross-module write — User.role promotion (CLI ekstrası)

A3b'de approve use case'i içinde `tx.user.update` ile `User.role = DRIVER`
yazımı ADR 0005 istisnası olarak kabul edildi. A3c'de aynı pattern
**promote-admin CLI'da** tekrarlanıyor:

```ts
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  await tx.outboxEvent.create({
    data: { eventType: "identity.UserRolePromoted", payload: {} },
  });
});
```

CLI bağlamında bu daha az problemli — script tek seferlik, modüler izolasyon
runtime kuralı değil tooling kuralı. Ama outbox event'i atomik tutmak için
aynı tx şart.

### Next.js 15 `useSearchParams` Suspense bailout

Next 15 build'de `useSearchParams` kullanan herhangi bir client component
**Suspense ile sarılmalı** yoksa prerender bailout error. Pattern:

```tsx
export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />
    </Suspense>
  );
}
```

Default export Suspense wrapper'a, hook child component'a. A3c login
sayfasında bu hatayla karşılaştık.

### Admin auth: localStorage MVP

`apps/admin/src/lib/api-client.ts` access + refresh token'larını localStorage'da
tutuyor. **MVP kararı, prod-grade değil:**

- XSS riski: malicious script localStorage'a erişebilir. CSP + güvenli
  3rd-party deps + bilinçli kod kuralı yeterli savunma A3c için.
- A4'te httpOnly cookie + CSRF token + SameSite=Strict pattern'e geçiş.
  Customer mobile app aynı backend'i kullanırken bu değişim shared.

`useRequireAuth` hook her sayfada `/auth/me` çağırır — token live olduğunu
ve role'ün hâlâ ADMIN olduğunu doğrular. Token revoke / role downgrade
durumunda bir sonraki sayfa load'unda /login'e yönlendirir.

### Minimal UI primitives (shadcn alternative)

shadcn CLI yerine `clsx` + `tailwind-merge` + `class-variance-authority` ile
Button + Input + Card + Table elle yazıldı (`apps/admin/src/components/ui/`).
Sebep:

- shadcn CLI Radix UI komponentleri (15+ npm package) ekliyor — A3c için
  overkill (table, button, input, card yetiyor).
- Driver approval queue Radix dialog gerektirmedi (prompt() MVP yeterli).
- Genişleme: dialog/select/dropdown gerektiğinde `pnpm dlx shadcn@latest add`
  çağrısı çalışır (components.json yoksa init önce).

### Admin ESLint strict parity (Option B uygulandı)

A3a'dan TODO kapandı. `apps/admin/.eslintrc.json` içine:

- `@typescript-eslint/no-explicit-any: error`
- `@typescript-eslint/no-non-null-assertion: error`
- `@typescript-eslint/consistent-type-imports: error`
- `@typescript-eslint/no-unused-vars: error`
- `import/order: error` (root config ile aynı groups + alphabetize)
- `no-console: error` (warn/error allowlist)

Root `eslint.config.mjs` flat config admin'i hâlâ ignore ediyor — admin
kendi `.eslintrc.json` (legacy format, `next lint` zorunlu) ile strict
seviyede çalışıyor. Next 16'da `next lint` deprecated; o zaman flat'a
geçiş + root config'e admin scope.

---

## 2026-04-25 — Integration test green hotfix

### Problem

A3c merge sonrası 3 integration kırmızı (lint/typecheck/build/unit yeşil):

1. `storage.integration-spec.ts` — `StorageBootstrapService` `InjectPinoLogger`
   ile `PinoLogger`'ı inject ediyor; test module'ü `LoggerModule.forRoot()`
   import etmediği için DI fail. 5 test skip.
2. `auth.controller.e2e-spec.ts` — A2c-followup'ta eklenen Redis sliding
   window rate limiter idempotency testlerinde 429 dönüyor. Suite içinde
   hardcoded `+90555` phone'lar + supertest default IP (`::1`) → per-IP
   minute limit 3 saniye içinde dolu, 4. test 429 alıyor.
3. `driver-onboarding-lifecycle.e2e-spec.ts` — Testcontainers temiz DB,
   `wedding-car` kategorisi yok, `findActiveVehicleType` null dönüyor.

Production akışında üçü de doğru davranış — test setup eksiklikleri.

### Çözümler

**1. Storage bootstrap test'te override (no-op).** `setup-integration.ts`
zaten MinIO container'ında bucket'ı `S3Client + CreateBucketCommand` ile
yaratıyor; test'te ayrıca bootstrap çalıştırmak gereksiz. `LoggerModule`
import etmek yerine provider override:

```ts
.overrideProvider(StorageBootstrapService)
.useValue({ onApplicationBootstrap: async () => { /* no-op */ } })
```

`overrideProvider().useValue()` NestJS DI'a "constructor çağırma" der —
PinoLogger DI hiç tetiklenmez. LoggerModule import etmek "sadece DI gerek"
diye fazla geniş.

**2. `uniquePhone()` test util + Redis `rl:otp:*` cleanup beforeEach'te.**
Tek katman yetmedi: phone unique olsa bile suite içindeki 4. OTP request'i
default IP'den geliyor, per-IP-minute (3) 429 üretiyor. İki katman:

- `uniquePhone()` — `+905XXXXXXXXX` random, per-phone bucket çakışmasın
- `redis.client.del('rl:otp:*')` beforeEach'te — per-IP bucket suite
  arası reset

Production rate limiter dokunulmadı; test kendi izolasyonunu sağlıyor.
`returning-user.integration-spec.ts`'deki precedent'i taşıdık.

**3. `setupCatalogFixtures(prisma)` helper.** Lifecycle test'in ihtiyacı
olan minimum data (1 ServiceCategory + 1 VehicleType + 3 VEHICLE-scope
attribute def `trim_color` / `has_air_conditioning` / `has_chauffeur`).
Tam seed admin user + 5 attribute def yaratıyor — test için overkill.
Helper idempotent (upsert by slug); diğer test'ler de re-use edebilir.

### Side fix: driver-profile.integration-spec.ts FK

A3b'nin `driver-profile.integration-spec.ts` beforeEach'inde availability
cleanup yoktu. Lifecycle test bir VehicleAvailability bırakırsa, bir
sonraki suite çalıştığında `vehicle.deleteMany()` FK violate ediyordu
(`vehicle_availabilities_vehicle_id_fkey`). Cleanup order'ına
`vehicleAvailability.deleteMany({})` eklendi — A3c migration etkisi.

Genel kural: **yeni FK eklediğin migration sonrası, mevcut test
beforeEach cleanup'larını gözden geçir.** Cross-suite contamination en
kolay buradan çıkar.

### CI gap kapatıldı: Prod build smoke job

`.github/workflows/ci.yml`'a `prod-build-smoke` job. Postgres + Redis +
MinIO services, `pnpm build` + `node apps/api/dist/main.js` + `/healthz`
30 saniye polling. Yakalayacağı:

- CJS/ESM regression (dual-format gibi)
- Zod env validation hataları (yeni env eklenince schema güncellenmemişse)
- NestJS DI resolution hataları (storage bootstrap gibi prod yolda)
- Boot süresi patlamaları (Faz 2'de payment, booking eklendikçe)

### Lessons learned

1. **Lokal smoke yapılmadan merge etmek 3 sessiz hata bıraktı.** Solo
   geliştiricinin "branch protection yok" disiplini eksiği — gelecek
   PR'larda lokal `pnpm test:integration` checklist zorunlu (PR template
   güncelle A4 başında).
2. **Vitest ESM ≠ nest start CJS.** Test path runtime hatalarını
   yakalamıyor; prod build smoke job bu kapıyı kapattı.
3. **Rate limiter doğru çalışıyor (429 dönüyor!)** ama test'ler bunu
   bilmiyordu. Production behavior değişmedi, test'ler katılaştı.
4. **Yeni FK = beforeEach cleanup audit zorunlu.** Cross-suite
   contamination her zaman yeni schema göçüne tepkisi geç olan eski test'ten.

### Helper konumu konvansiyonu

`apps/api/test/helpers/` altına paylaşılan test util'ları:

- `phone-factory.ts` — `uniquePhone()`
- `catalog-fixtures.ts` — `setupCatalogFixtures()`

Yeni helper eklenince buraya. Module-spesifik fixture'lar (`booking/`,
`payment/`) A4'te eklenecek alt klasörlerde.

---

## 2026-04-27 — Session A4a (Pricing engine + booking quote)

### Decimal her yerde para

`Decimal.js` + Prisma `@db.Decimal(10, 2)` para kolonlarında zorunlu. JS
`number` para hesabında YASAK (`0.1 + 0.2 === 0.30000000000000004`). MoneyVO
`multiply()` her zaman `Decimal.ROUND_HALF_UP` ile 2 ondalığa yuvarlar —
`5500 × 1.30 = 7150.00`, `5500.50 × 1.30 = 7150.65` deterministik. Test
pinleri ADR 0017 sözleşmesi.

### External API call transaction'dan ÖNCE (ADR 0010 disiplin)

`RequestPriceQuoteUseCase` Google Maps Distance Matrix çağrısını `txRunner.run`'ın
DIŞINDA yapar. 5 saniyelik HTTP timeout DB lock'ları tutmasın diye. Aynı
disiplin A3b'de Storage presigned URL üretiminde de vardı; pattern artık
"new external integration → tx-dışı" refleksi.

### DistanceCalculator factory: dummy key sentinel (ADR 0018)

`pricing.module.ts` `useFactory`: `GOOGLE_MAPS_API_KEY.startsWith("AIzaSy_DUMMY")`
true ise `MockDistanceCalculator` (haversine × 1.4, 40 km/h), aksi halde
`GoogleMapsDistanceCalculator`. `.env.example` dummy ile gelir → yeni geliştirici
sıfır key'le boot eder. Test setup (`setup-integration.ts`) dummy değer set
eder; integration suite hiç gerçek API'ya dokunmaz.

### `getLoggerToken` (nestjs-pino) factory provider'da

`PinoLogger`'ı factory içinde inject etmek için `inject:` array'inde
`getLoggerToken(ClassName)` kullanılır. `LoggerModule.forFeature` veya
`LoggerModule.forRoot` re-import gereksiz — global LoggerModule yeterli,
sadece sınıfa özel logger token'ını çözmek için bu helper.

### Quote consume: atomic updateMany (race-safe)

`PrismaPriceQuoteRepository.consumeQuote`: `updateMany WHERE status='ACTIVE'
AND expiresAt > now`. Prisma `update` yerine `updateMany` çünkü iki
eşzamanlı booking aynı quote'u consume etmeye çalışırsa biri 1, diğeri 0
satır günceller. `count === 0` durumunda mevcut row'a göre doğru error
seçilir (`QuoteAlreadyConsumedError` / `QuoteExpiredError` / `QuoteNotFoundError`).
A4b booking creation use case bunu içinden çağıracak.

### Outbox payload PII benzeri konum bilgisini taşımaz

`pricing.PriceQuoteCreated` payload: `quoteId`, `vehicleTypeId`, `categoryId`,
`totalAmount`, `currency`, `expiresAt`. **Yok:** lat/lng, address. Lokasyon
müşteri bilgisi → privacy-by-design. Subscriber raporlama vs. için ihtiyaç
duyarsa quote tablosundan audit-log'lu okuma yapsın. Test bu disiplini
`expect(payloadJson).not.toContain("Sultanahmet")` ile pinler.

### Rule snapshot: immutable price guarantee

`PriceQuote.breakdown` JSONB hesaplama anındaki rule isim + multiplier +
addon listesini taşır. Admin sonradan rule'u değiştirse / silse bile quote
sabit. Booking confirm'de re-calculate yok, doğrudan quote'tan total
alınır. ADR 0017 § "Rule snapshot".

### tsx + tsconfig include

`prisma/seed.ts` (`tsx` ile çalışıyor) `seedWeddingCarPricing()` fonksiyonu
yeni eklendi. Hâlâ aynı root flat ESLint ignore'da (`prisma/**`); fonksiyon
sayısı artarken seed dosyası bölünmek zorunda kalırsa A4b'de `prisma/seed/`
alt klasör + per-domain dosya pattern'i düşünülecek.

### A4b'de yapılacak (bağlı altyapı zaten hazır)

- `CreateBookingFromQuote` use case: `consumeQuote` + Booking row
- Booking state machine (XState veya elle finite-state map)
- Booking confirm/cancel use case'leri + outbox event'leri
- `BookingExpiryWorker` (BullMQ): unconfirmed DRAFT bookings + EXPIRED
  PriceQuote temizliği
- Customer mobile akışı (Faz 2 paralel)

---

## 2026-05-05 — Session A4b (Booking State Machine + Workers)

A4a Pricing motorunu kullanarak Booking modülünü canlandıran oturum.
9-state lifecycle, atomic confirm, customer/admin cancel, BullMQ-tabanlı
DRAFT TTL + PriceQuote cleanup worker'ları, public + admin controller'lar.

### Test-only OTP endpoint (smoke ergonomi düzeltmesi)

A4a smoke'unda kullanıcının API log'undan OTP kodu kopyalaması felaketti.
A4b'de port + adapter pattern'iyle çözüldü:

- `TestOtpCachePort` (application/ports) — soyutlama
- `InMemoryTestOtpCache` (infrastructure) — dev/test, 60s TTL, NODE_ENV
  guard'ı içeride
- `NoopTestOtpCache` — production'da bind, hep null döner
- `TestOnlyController` — `GET /auth/_test/last-otp?phone=...`,
  `IdentityModule.controllers` içinde `NODE_ENV !== "production"` ise mount

Defense in depth: production'da hem controller hiç bind olmaz, hem cache
no-op'tur. `RequestOtpUseCase` plain code'u `cache.record(phone, code)`
ile kaydeder — SMS body parse etmek yerine explicit data flow.

### Booking schema genişlemesi

A4a iskeleti 5 kolon + 1 enum'dan (DRAFT) ibaretti. A4b 8 enum değer +
~20 kolon ekledi:

- Quote snapshot kolonları (pickup/dropoff lat/lng/address, event window,
  totalAmount, currency) — immutable price guarantee'nin uygulaması
- Lifecycle audit timestamps (`confirmedAt`, `driverAssignedAt`,
  `startedAt`, `completedAt`, `cancelledAt`, `expiredAt`)
- Cancellation context (`cancellationReason`, `cancelledByUserId`)
- Driver/vehicle FK'ları (A4d'de doldurulacak)
- `deletedAt` (soft delete)
- 4 yeni index (status+eventStartAt, driver+status, eventStartAt)

Migration `prisma migrate diff --script` ile üretildi (CLAUDE.md kuralı).
Bookings tablosu boştu, NOT NULL ekleme güvenli — migration header'ında
not düşüldü ki prod'a giderken backfill düşünülsün.

### State machine pattern (ADR 0019)

Custom hand-rolled FSM, XState değil. 9 state × 11 transition
`ALLOWED_TRANSITIONS` tablosunda. Üç seviye gardiyan:

1. `BookingStateMachine.assertTransition()` — domain layer
2. `repo.transitionStatus(tx, { fromVersion })` — atomic optimistic lock
3. Prisma enum — DB layer son durak

37 spec test her geçerli + bir avuç geçersiz transition'ı pinler.
`IN_PROGRESS → CANCELLED_*` deliberately yok — event başladıysa müşteri
DISPUTED akışına gider. Bu kuralın değişme olasılığı yüksek (A4d driver
no-show senaryosu) ama o zaman ADR güncellemesi + spec güncellemesi
beraber gelir.

### DRAFT bypass (geçici, A4c'de geri alınacak)

`ConfirmBooking` A4b'de DRAFT'ı atlayıp direkt CONFIRMED yaratıyor. Çünkü:

- Mobile flow şu an: quote → onayla butonu → confirm
- Ödeme gelmeden DRAFT-CONFIRMED ayrımı UX'e değer katmıyor
- A4c (payment) gelince: confirm → DRAFT, payment.authorized → CONFIRMED

`BookingExpiryWorker` zaten DRAFT'ı süpürür. A4b'de gerçek DRAFT row
yok, worker dead-code; spec sentetik DRAFT row'la sweep çalıştırıyor —
sözleşme A4c'ye hazır.

### Atomic ConfirmBooking flow

```
tx.run(async (tx) => {
  const quote = await quoteRepo.findById(tx, quoteId);   // owner check
  if (quote.requestedByUserId !== actor.userId) throw BookingAccessDenied;

  const consumed = await quoteRepo.consumeQuote(tx, quoteId, bookingId, now);
  // updateMany WHERE status='ACTIVE' AND expiresAt>now → race-safe

  const booking = await bookingRepo.create(tx, {
    ...consumed,        // snapshot — immutable price guarantee
    status: "CONFIRMED",
    confirmedAt: now,
  });

  await outbox.write(tx, BookingCreated);
  await outbox.write(tx, BookingConfirmed);
});
```

Owner check ÖNCE çalışır (yanlış kullanıcı consume'a kadar bile inmez).
İki paralel confirm aynı quoteId'ye yapılırsa biri başarılı, diğeri
QuoteAlreadyConsumedError. Smoke testi runtime'da kanıtladı: ikinci
confirm 409 döndü.

### Cancel ve aktör ayrımı

`CancelBookingUseCase` tek metodla iki aktöre hizmet ediyor: customer
ve admin. Her ikisi de target state CANCELLED_BY_CUSTOMER. Audit:
`cancelledByUserId = actor.userId` (admin müşteri adına iptal etse de
gerçek aktör korunur), event payload `cancelledByRole: "ADMIN" | "CUSTOMER"`.

Reason kolonu zorunlu (trim'lenmiş, non-empty), DB'ye yazılır ama outbox
payload'a GİTMEZ — free-text customer input, PII benzeri.

### BullMQ workers (NOT @nestjs/schedule)

Plan briefi `@Cron(EVERY_MINUTE)` örneği veriyordu ama bu codebase
BullMQ repeat job pattern'i kullanıyor (precedent: `IdempotencyCleanupScheduler`,
`OutboxScheduler`). `@nestjs/schedule` hiç kurulu değil. A4b iki worker
ekledi:

- `BookingExpiryService` + `Worker` + `Scheduler` — DRAFT bookings 30dk
  sonra EXPIRED + outbox event
- `PriceQuoteCleanupService` + `Worker` + `Scheduler` — ACTIVE quotes
  TTL geçince EXPIRED + outbox event

Service her ikisinde de Worker'dan ayrı; spec service.sweep() çağırıp
BullMQ olmadan FrozenClock altında test ediyor.

### Pricing rate limit (A4a TODO çözüldü)

`POST /pricing/quotes`: 10/dakika/user. Use case içinde
`RateLimiterPort.check()` (mevcut Redis sliding window altyapısı).
Idempotency-Key kontrolü controller'da, rate limit kontrolü use case'de —
form double-tap idempotency ile geçer, scraping rate limit ile durur.

### Outbox PII discipline (sürdürülüyor)

Tüm 4 booking event payload'ı:

- `BookingCreated` — bookingId, customerId, vehicleTypeId, categoryId,
  totalAmount, currency, eventStartAt, eventEndAt
- `BookingConfirmed` — bookingId, customerId, confirmedAt
- `BookingCancelled` — bookingId, cancelledByUserId, cancelledByRole,
  previousStatus, cancelledAt (REASON YOK)
- `BookingExpired` — bookingId, expiredAt

Hiçbiri lat/lng/address taşımıyor. Spec assertion'ı bunu pinler.

### Smoke kanıtı (A4a yorgunluğunun cevabı)

`scripts/smoke-booking-flow.mjs` — 11 adımlı tek dosya Node smoke:
healthz → OTP request → test-only OTP fetch → login → catalog → quote →
confirm (CONFIRMED) → double-confirm (409) → list → cancel
(CANCELLED_BY_CUSTOMER) → re-cancel (409). Smoke'u Node yazdık çünkü
bash + curl + jq + node-eval Windows MSYS'de `=>` arrow function
operatörünü redirect olarak yorumlayıp argv'yi mahvediyordu (tek dosya,
tek runtime tercih edildi).

Smoke runtime kanıtları:

- Quote total **6877.00 TRY** (×1.30 yaz × ×1.15 hafta sonu compound)
- 3 outbox event (BookingCreated/Confirmed/Cancelled) hepsi **processed**
  (BullMQ outbox worker drain)
- Atomic consume: 2. confirm 409
- Terminal-state guard: 2. cancel 409

### Lifecycle integration spec (Testcontainers) — A4c'ye ertelendi

A4a'da Docker Desktop sleep nedeniyle integration spec çalışmamıştı;
manuel smoke yeşil. A4b'de aynı seçim: smoke runtime'da happy path +
race + terminal guard'ları kanıtladı, ayrıca outbox drain DB'de
doğrulandı. Testcontainers spec'i A4c (payment) ile birlikte
yazılacak — orada provizyon/iade akışı için zaten gerçek DB lazım,
booking lifecycle de o pakette test edilebilir.

### A4c'ye devredilenler

- Payment (iyzico Marketplace adapter)
- Booking flow değişikliği: confirm → DRAFT, payment.authorized → CONFIRMED
- Refund logic (cancellation state-aware)
- Booking lifecycle Testcontainers spec
- Driver no-show senaryosu için state machine `IN_PROGRESS → CANCELLED_BY_DRIVER`
  düşüncesi (ADR güncellenir)

---

## 2026-05-07 — Session A4c (Dispatch — Driver Matching + Assignment)

A4b'nin DRIVER_ASSIGNED state'i state machine'de hazırdı ama hiçbir use
case oraya geçmiyordu. A4c bu boşluğu kapatır: PostGIS konum sorgusu,
deterministic scoring matcher, atomic assign + availability sentinel,
30 s tick BullMQ worker, manual reassign, driver location/online updates.

### PostGIS — generated geography column + GIST index

`driver_profiles` tablosuna `last_known_lat/lng` (Decimal 10,7) eklendi,
yanına `last_known_location geography(Point, 4326) GENERATED ALWAYS AS
(... ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography ...) STORED`.
Postgres lat/lng değişince column'u otomatik üretir; STORED diskte yer
kaplar ama her query'de hesap maliyeti olmaz.

GIST index partial: `WHERE last_known_location IS NOT NULL AND deleted_at
IS NULL`. `ST_DWithin(geography, geography, meters)` index'i kullanır,
candidate query <50 ms. Prisma DSL PostGIS'i bilmiyor — bu üç parça raw
SQL ile migration'da; client tarafında kolon Prisma şemasında `Decimal?`
olarak görünüyor (generated column generated client'ta görünmez ama bu
sorun değil — sadece SQL query'sinde kullanıyoruz).

### Raw SQL pattern

`tx.$queryRaw<RawRow[]>(Prisma.sql\`...\`)`—`${variable}`ile parameter
binding (SQL injection güvenli). Mevcut precedent`apps/api/src/common/outbox/outbox-drain.service.ts`. NUMERIC kolonları
JS tarafında string olarak gelir; mapper `Number(x)` ile çevirir.

### Deterministic matching (no ML)

Score = `0.7 × (1 - dist/maxRadius) + 0.3 × (rating/5)`. Tie-break
`driverProfileId` asc — aynı input aynı pick. Test'ler tam değer pinler:
5 km / 5.0 rating → 0.86, 1 km / 4.0 rating → 0.912 (1 km en yakın
yüksek skor). 12 matcher unit test.

ADR 0020 — bu kararın gerekçesi + alternatifler (FCFS broadcast,
bidding, ML).

### Atomic assign + availability sentinel (race-safe)

Tek tx içinde:

1. `assignDriver(tx, { fromVersion })` — `WHERE status='CONFIRMED' AND
version=fromVersion`. Concurrent dispatch null döner → throw
   `ConcurrentDispatchError`.
2. `availability.create({ type: 'BOOKED', bookingId })` — paralel
   dispatch tick'i bu sürücüyü bir daha aday görmez.
3. Outbox event (PII-free).

Bu sıra brief'in 4.2'sinden farklı (orada availability search içinde
filtered varsayılıyordu — biz INSERT'i sentinel olarak kullanıyoruz).
PostgreSQL READ COMMITTED altında uncommitted INSERT görünmez, ama
commit sonrası bir sonraki worker tick'inde kesin filter.

### ManualReassign — state machine'i değiştirmedik

DRIVER_ASSIGNED'da admin başka driver atayabilmeli. Brief önerisi: state
DRIVER_ASSIGNED → CONFIRMED → DRIVER_ASSIGNED round-trip. Daha temiz
çözüm: `reassignDriver` repo metodu — `WHERE status='DRIVER_ASSIGNED'`,
sadece driverId/vehicleId/driverAssignedAt/dispatchAttempts/lastDispatchAt
güncellenir, status değişmez. State machine table'ı (ADR 0019) sabit
kalır. Önceki BOOKED availability soft-delete'lenir.

### BookingExpiry pattern'inin tekrarı

`BookingDispatchService` (saf logic, FrozenClock test edilebilir),
`BookingDispatchWorker` (BullMQ shell), `BookingDispatchScheduler`
(`OnModuleInit` + `queue.add(..., { repeat: { every } })`,
`OnApplicationShutdown` + `queue.close`). A4b precedent ile aynı.

### Cooldown + max attempts

`findDispatchable`: `dispatchAttempts < DISPATCH_MAX_ATTEMPTS` (default 3)
AND `(lastDispatchAt IS NULL OR lastDispatchAt < now - cooldownMs)`
(default 60 s). Worker boşa beat etmez.

`requiresManualReview: true` event payload'da `attempts >= max`. A4d/A4e
admin paneli buradan beslenir.

### Outbox PII discipline (sürdürülüyor)

3 dispatch event payload:

- `dispatch.DriverDispatched` — bookingId, driverProfileId, vehicleId,
  distanceKm, score, attempts, dispatchedAt
- `dispatch.DispatchFailed` — bookingId, attempts, reason,
  requiresManualReview, failedAt
- `dispatch.ManualReassignment` — bookingId, previousDriverProfileId,
  newDriverProfileId, reassignedByUserId, reassignedAt

Hiçbiri driver name / plate / lat/lng / address taşımıyor.

### Smoke kanıtı

`scripts/smoke-booking-flow.mjs` 11 → **13 adım**. Yeni adımlar:

- Step 12: ikinci booking confirm (farklı event window — cancel'lanan
  booking ile çakışmasın), 65 s rate-limit beklemesi
- Step 13: 5 s aralıklarla GET /bookings/:id polling, ≤ 90 s içinde
  status `DRIVER_ASSIGNED` + driverId set bekle

Smoke runtime kanıtları:

- Booking2 status → DRIVER_ASSIGNED (worker 30 s tick içinde)
- driverId/vehicleId set (seed fixture driver eşleşti)
- Outbox: BookingCreated + BookingConfirmed + **dispatch.DriverDispatched**
  hepsi `processed_at IS NOT NULL` (BullMQ outbox drain doğrulandı)

Driver fixture seed (`prisma/seed.ts seedDispatchFixture()`): admin
phone'la ayrı bir DRIVER user, APPROVED profile near Sultanahmet
(41.0095, 28.9800), ACTIVE classic-sedan vehicle. Idempotent (deterministic
UUID'ler). Production guard'lı.

### A4d/A4e/A4f'ye devredilenler

- Driver kabul/red akışı (driver app'te match edilince bildirim,
  onay/red, red ise reassign tetikle)
- Notifications (driver SMS/push, customer "sürücünüz yolda" SMS)
- Admin manual-review queue UI (dispatchAttempts >= max + dispatchFailedReason)
- Online drivers monitoring dashboard
- Real-time driver location streaming (websocket — Faz 3+)
- DriverSearchRepo Testcontainers integration spec (CI'da PostGIS
  query'sinin gerçek DB'de doğrulanması — şimdilik smoke runtime kanıt)
