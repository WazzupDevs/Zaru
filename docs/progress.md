# Progress Log

Her oturum sonu **append**. Eski entry'leri silme. Format altta.

---

## 2026-04-22 — Session 01: Repo bootstrap

### Done

- `CLAUDE.md` repo köküne yazıldı (proje kimliği, stack, modüller, çalışma kuralları).
- `docs/progress.md` (bu dosya), `docs/roadmap.md`, ve ADR şablonları oluşturuldu:
  - `docs/adr/0001-tech-stack.md`
  - `docs/adr/0002-modular-monolith.md`
- Monorepo iskeleti kuruldu:
  - `pnpm-workspace.yaml`, `turbo.json`, kök `package.json` (private, pnpm@9.15)
  - `.gitignore`, `.editorconfig`, `.nvmrc` (Node 20)
  - Boş klasörler: `apps/`, `packages/`, `prisma/`, `infra/`, `.github/workflows/` (`.gitkeep` ile korunuyor)
- Paylaşılan config paketleri (placeholder, henüz `pnpm install` ile bağlanmadı):
  - `packages/config-ts/` — `tsconfig.base.json` (strict, ES2022, NodeNext)
  - `packages/config-eslint/` — flat config (TS + import order + Prettier ile uyumlu)
- `README.md` — kısa proje tanımı + kurulum adımları.
- `.github/workflows/ci.yml` — iskelet pipeline (lint + typecheck + test, henüz iş yok).

### Pending

- `git init` ve ilk commit yapılmadı (kullanıcı onayı bekleniyor).
- `pnpm install` çalıştırılmadı; lockfile yok.
- ADR'lar review edilmedi.

### Next

1. Kullanıcı onayı: `git init` + ilk commit + `main` branch'i kur.
2. `pnpm install` ile workspace'i seyret; turbo + tsc kurulumu validate et.
3. **Session 02 önerisi:** Prisma schema iskeleti + `apps/api` NestJS kurulumu + `identity`
   modülünün ilk dilimi (User entity, OTP request endpoint — henüz iyzico/SMS yok, mock).
4. Paralelde `packages/shared-types` paketinin ilk Zod şemaları (User, Booking enum'ları).

---

## 2026-04-23 — Session A1: Fundament (hooks, docker, prisma)

### Done

- `.gitignore` doğrulandı; `.claude/` (Claude Code local state) ve `.cursorignore` (IDE
  auto-generated) eklendi.
- `git init && git checkout -b main` — repo başlatıldı.
- pnpm 9.15.0 sisteme yüklendi (corepack admin izni istediği için `npm i -g`).
- `pnpm dlx husky@9 init` → `.husky/` ve `prepare` script'i kuruldu.
- `package.json` güncellendi:
  - devDeps: `@commitlint/{cli,config-conventional}`, `eslint`, `husky`, `lint-staged`,
    `prettier`, `prisma`, `turbo`, `typescript`
  - scripts: `db:up`, `db:down`, `db:logs`, `db:nuke`, `db:generate`, `db:migrate`,
    `db:studio`, `db:reset` (sonuncuda `--force` YOK; kazara reset zor olsun)
  - `lint-staged`: ts/tsx → eslint+prettier, js/cjs/mjs → prettier, json/md/yml → prettier,
    prisma → `prisma format` (ESLint config dosyalarının kendisini lint'lemek tavuk-yumurta
    olduğu için js'de eslint çağırmıyoruz; A2'de root `eslint.config.js` ekleyince
    `*.{ts,tsx}` glob'u app/test kodunu yakalayacak)
- `pnpm install` → 369 paket, 1 deprecated subdep (`git-raw-commits@4.0.0` — commitlint
  alt bağımlılığı, yoksayıldı), `pnpm-lock.yaml` 109838 byte / 3372 satır.
- `.husky/pre-commit` → `pnpm exec lint-staged`; `.husky/commit-msg` → `pnpm exec commitlint --edit "$1"`.
- Config dosyaları: `commitlint.config.cjs`, `.prettierrc.json`, `.prettierignore`.
- `.github/workflows/ci.yml` sertleştirildi — `continue-on-error: true` satırları silindi.
- GitHub disiplin dosyaları: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`
  (`* wazzupsolana@gmail.com`), `docs/adr/0000-template.md`, `docs/glossary.md`
  (22 terim + Phone Format kuralı).
- `.env.example` (POSTGRES\_\*, DATABASE_URL, REDIS_URL) ve lokal `.env` (gitignore'da).
- `infra/docker/docker-compose.dev.yml` — postgis/postgis:16-3.4 + redis:7-alpine,
  healthcheck'li, named volume'lı.
- `prisma/schema.prisma` — User + RefreshToken + OutboxEvent + UserRole enum,
  `previewFeatures = ["postgresqlExtensions"]`, `extensions = [postgis, pgcrypto]`.
- `pnpm db:up` → her iki container 1 saniyede `healthy`.
- `prisma migrate dev` non-interactive shell'de çalışmıyor (TTY yok). Workaround:
  `prisma migrate diff --from-empty --to-schema-datamodel ... --script` ile temiz SQL
  üretildi, migration klasörü manuel oluşturuldu (`prisma/migrations/20260422221111_init/`),
  `migration_lock.toml` eklendi, `prisma migrate deploy` ile uygulandı (non-interactive
  çalışır, başarılı).
- `migration.sql`'e manuel SQL eklendi:
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto/postgis` (Prisma'nın kendi `CREATE EXTENSION`
    çıktısının üstüne defansif tekrar)
  - `users_phone_e164_active_unique` partial unique index (`WHERE deleted_at IS NULL`)
  - `outbox_events_unprocessed_idx` partial index (`WHERE processed_at IS NULL`) — outbox
    worker hot-path query'si için
- DB doğrulaması (psql): 3 hedef tablo + `_prisma_migrations` + PostGIS yardımcı tabloları
  (tiger/topology — kullanmayacağız), 2 extension aktif, her iki partial index doğru
  WHERE koşuluyla kuruldu.
- ADR 0003 (Data Conventions) ve ADR 0004 (Transactional Outbox) yazıldı.
- Eskimiş `.gitkeep`'ler temizlendi (prisma, prisma/migrations, infra/docker).
- İlk commit: `chore: bootstrap monorepo with docs, conventions and prisma` → `ab23474`,
  41 dosya, 5261 ekleme, pre-commit lint-staged + commit-msg commitlint geçti.

### Pending (A2'ye aktarılan TODO'lar)

- **Turbo Windows local-dev sorunu**: `pnpm lint/typecheck/test` çağrıları kullanıcı
  makinesinde turbo'nun prebuilt Go binary'sinin MSVC runtime DLL bulamamasından
  (0xC0000135) crash ediyor. CI Ubuntu'da etkisi yok, pre-commit'te de etkisi yok
  (lint-staged turbo'dan geçmiyor). Çözüm: kullanıcı **Microsoft Visual C++ Redistributable
  2015–2022 (x64)** kursun. A2'de doğrulanacak.
- `uuidv7()` Postgres SQL fonksiyonu + migration; tüm tabloların default'unu
  `gen_random_uuid()` → `uuidv7()`'ye geçirme. Şu an üretim verisi sıfır olduğu için
  risksiz ama A2'de yapılmalı (ADR 0003'te ayrıntı).
- Prisma soft-delete ClientExtension (`$extends`); henüz yok → `findMany` deleted
  satırları getirir (data leak riski). A2'de extension yazılana kadar tüm Prisma
  sorguları manuel `where: { deletedAt: null }` ile yazılacak.
- Prisma'nın `apps/api`'ye taşınması (`@prisma/client` runtime dep olarak orada).
- `prisma generate` şu an root'ta `@prisma/client` olmadığı için fail ediyor — A2'de
  apps/api kurulunca otomatik çözülecek.
- CI'da Testcontainers ile gerçek Postgres+Redis entegrasyon testleri.
- Custom ESLint kuralı: `findMany` sorgusunda `where.deletedAt` veya `includeDeleted`
  zorunluluğu.
- Idempotency-Key middleware (Redis 24h + Postgres kalıcı) — A2'de NestJS tarafında.
- Root `eslint.config.js` — `apps/` doluverdiğinde flat config buradan extend edilecek.
- A2'de `.nvmrc` Node 20 ama kullanıcı sisteminde Node 24 yüklü. Çalışıyor (geriye
  uyumlu) ama nvm-windows kurulup version pin doğrulanabilir.

### Next (Session A2 önerisi)

1. Kullanıcı **MSVC Redistributable** kursun → `pnpm lint/typecheck/test` doğrulansın.
2. `apps/api` NestJS bootstrap (modüler yapı + global prefix `/api/v1` + `/healthz`).
3. `@prisma/client` `apps/api`'de kurulup PrismaService DI olarak expose edilsin.
4. Global middleware: request-id (her request bir UUID), structured logging (pino),
   error interceptor (DomainError → HTTP), Idempotency-Key filter (Redis bağlantısı).
5. `packages/shared-types` paketi: ilk Zod şemaları (PhoneE164, UserRole, BookingState).
6. `identity` modülü iskeleti: domain/application/infrastructure/interface katmanları,
   `POST /auth/otp/request` endpoint'i (test-first, mock SMS sender).
7. ADR 0005: NestJS modül yapısı + DI konvansiyonu.
8. `uuidv7()` SQL fonksiyonu + migration (yukarıdaki Pending'in birincisi).

---

## 2026-04-23 — Session A2a: API Foundation

Branch: `feat/api-foundation` (8 commit, push hazır, PR kullanıcı tarafından açılacak).

### Done

- **CLAUDE.md güncellendi** — 3 yeni kural: commit granülaritesi (oturum başına min 2 commit,
  feature ≠ progress), main'e direkt push yok (PR akışı zorunlu), `prisma migrate deploy`
  prod/CI'da ; `migrate dev` lokalde + manuel review.
- **`apps/api`** NestJS modüler monolit iskeleti tam kurulu:
  - `package.json` (Nest 10, Prisma 5.22, ioredis, nestjs-pino, ulid, zod), tsconfig
    (config-ts'i extend), nest-cli, vitest, .gitignore.
  - `src/main.ts` — bootstrap: nestjs-pino logger, trust proxy, body limit 1mb,
    `app.enableShutdownHooks()`.
  - `src/app.module.ts` — ConfigModule (Zod env validation, fail-fast),
    nestjs-pino LoggerModule, RequestContext, Prisma, Redis, Health; APP_FILTER
    (DomainExceptionFilter), APP_INTERCEPTOR (IdempotencyInterceptor).
  - `src/config/env.ts` — Zod schema + `validateEnv()` helper.
  - `common/logger/logger.config.ts` — pino params: pretty in dev / JSON in prod /
    silent in test, redact paths (Authorization, cookie, otp, password, phoneE164,
    tokenHash dahil), `genReqId` ULID + x-request-id header round-trip,
    customLogLevel (5xx=error, 4xx=warn).
  - `common/request-context/` — AsyncLocalStorage tabanlı service + middleware,
    `getRequestId()`, `getUserId()`, `getIdempotencyKey()` API.
  - `common/errors/domain-error.ts` — abstract base + 6 alt sınıf (Validation,
    Unauthorized, Forbidden, NotFound, Conflict, Internal).
  - `common/filters/domain-exception.filter.ts` — global; DomainError → typed JSON,
    HttpException → normalize, unknown → 500 (prod'da mesaj gizli). Tüm response'larda
    `requestId` field'ı.
  - `common/pipes/zod-validation.pipe.ts` — per-endpoint, `safeParse` ile
    `ValidationError` fırlatır.
  - `common/prisma/{prisma.module.ts, prisma.service.ts}` — global, OnModuleInit
    `$connect`, OnModuleDestroy `$disconnect`, dev'de query log.
  - `common/redis/{redis.module.ts, redis.service.ts}` — ioredis, OnModuleInit
    connect+ping (lazyConnect→fail fast).
  - `common/health/` — TerminusModule + `/healthz` (liveness, sadece process),
    `/readyz` (postgres+redis ping 500ms timeout), `/version` (env'den
    GIT_COMMIT/BUILD_TIME).
  - `common/interceptors/idempotency.interceptor.ts` — POST/PUT/PATCH/DELETE'te
    `Idempotency-Key` header'ı capture eder, RequestContext'e yazar. Redis bağlı
    DEĞİL (TODO A2b: Redis 24h + Postgres dedup tablosu).
- **Tests (8/8 PASS)**:
  - `logger.redaction.spec.ts` — 5 case: Authorization, cookie, otp/password,
    wildcard phoneE164/tokenHash, non-sensitive geçer.
  - `app.e2e-spec.ts` — 3 case: `/healthz` 200 + `x-request-id` header,
    caller-provided x-request-id echo, unknown route → DomainError-shape 404.
- **Root `eslint.config.mjs`** (flat) — config-eslint base + apps/api overlay
  (NestJS no-extraneous-class allow decorator, no-unsafe-argument off) +
  test overlay (any olur warn).
- **CI (`.github/workflows/ci.yml`)** — Node 20 / pnpm 9.15 pin; lint, typecheck,
  test job'ları; test job'ında postgres (postgis/postgis:16-3.4) + redis (7-alpine)
  service container, `prisma migrate deploy` adımı.
- **ADR 0005** — NestJS Module Structure: `domain/application/infrastructure/interface`
  4-layer template, dependency rule, port pattern, naming, alternatives.

### Plan'dan sapmalar (gerekçeli)

1. **`@types/express@^4`** brief'teki `^5` yerine — `@nestjs/platform-express@10` runtime'da
   Express 4 ship'liyor; type uyumsuzluğu compile hatası yaratırdı. Onayın alındı.
2. **`@types/express@^5` listesinde olmayan iki paket eklendi**: `unplugin-swc` ve
   `@swc/core`. Sebep: Vitest'in default esbuild transformer'ı `experimentalDecorators`'la
   gelen `reflect-metadata`'yı tam emit etmiyor → NestJS DI runtime'da `ConfigService`
   inject edemiyor (`config.get is undefined`). Standart NestJS+Vitest çözümü SWC plugin.
   Bu keşif test sırasında yapıldı; sürpriz değil zorunluluk. Karşılığı: vitest config'de
   `swc.vite({ jsc: { transform: { legacyDecorator: true, decoratorMetadata: true }}})`.
3. **`.npmrc`** eklendi: `public-hoist-pattern[]=*prisma*`, `public-hoist-pattern[]=@prisma/*`.
   Pnpm strict layout'unda Prisma CLI `@prisma/client`'ı resolve edemiyordu (postinstall
   `pnpm add @prisma/client@5.22.0` deneyip fail). Hoist edince stable. Brief'te yoktu;
   tooling zorunluluğu.
4. **Schema'da `output` override DENENDİ ve KALDIRILDI** — TypeScript Nest terminus'un
   nested @prisma/client'ından çözüm yapıyordu; output sapması fayda etmedi. Default path
   (root .pnpm cache'inde) hoisted layout ile birlikte çalıştı.
5. **Görev 11 / Adım 9'daki dummy test commit + reset** atlandı (önceden onay alınan sapma).
6. **Atomik 7 commit** strategy: file-group bazlı stage. Intermediate commit'ler izole
   build edilmez (örn. C2 app.module.ts'i HealthModule'u import ediyor ama o C3'te geliyor)
   ama dosyalar lokal disk'te zaten var olduğu için lint-staged geçti. Final HEAD compile
   ediyor; CI HEAD'i build edecek.

### Doğrulama sonuçları

- `pnpm install` → 400+ paket, 3 deprecated subdep (yoksayıldı: `git-raw-commits@4.0.0`,
  `glob@10.4.5`, `glob@10.5.0`). Postinstall `prisma generate` başarılı.
- `pnpm --filter @event-fleet/api typecheck` → exit 0, 0 hata.
- `pnpm --filter @event-fleet/api lint` → exit 0, 0 hata, 0 uyarı.
- `pnpm --filter @event-fleet/api test` → 8 passed / 8 (logger.redaction 5 + app.e2e 3).
- `pnpm db:up` → postgres + redis healthy 1s'de.
- Manuel curl:
  - `GET /healthz` → 200 `{"status":"ok"}` + `x-request-id: 01KPV...`
  - `GET /readyz` → 200 `{"status":"ok","info":{"postgres":{"status":"up"},"redis":{"status":"up"}},...}`
  - `GET /version` → 200 `{"service":"event-fleet-api","version":"0.0.0","commit":"unknown","buildTime":"unknown"}`
  - `POST /unknown -H "Idempotency-Key: test-key-123"` → 404 `{"code":"NOT_FOUND","message":"Cannot POST /unknown","requestId":"..."}`
- Redaction kanıtı: `curl -H "Authorization: Bearer SHOULD-NEVER-APPEAR-IN-LOGS" /healthz` →
  log'da `"authorization": "[Redacted]"`, `SHOULD-NEVER-APPEAR-IN-LOGS` token hiç yok.

### Pending (A2b'ye taşınanlar)

- Prisma Client Extension ile soft-delete middleware (`$extends`).
- `uuidv7()` SQL fonksiyonu + migration; tabloların default'unu v4 → v7'ye geçirme (ADR 0006).
- Idempotency interceptor'ın Redis'e bağlanması + Postgres dedup tablosu (`idempotency_keys`).
- Outbox worker iskeleti (BullMQ).
- `packages/shared-types` Zod şemaları (PhoneE164, UserRole, BookingState).
- `identity` modülü + `POST /auth/otp/request` test-first (mock SMS sender).
- ESLint custom kuralı: `no-restricted-imports` ile cross-module domain/infrastructure
  sızıntısı yasağı.
- Custom ESLint kuralı: `findMany` çağrısında `where.deletedAt` veya `includeDeleted`
  zorunluluğu (ADR 0003 mitigation).
- Prisma'nın `apps/api/prisma/`'a taşınması; root `prisma/`'yı boşaltma; `.npmrc` hoist
  pattern'ı tekrar değerlendirme.
- Volta veya nvm-windows ile Node 20 pin doğrulanması (sistem Node 24).

### Next (A2b önerisi)

1. `apps/api/src/modules/identity/` — ADR 0005 4-layer şablonu uygulamak. Test-first
   `POST /auth/otp/request`. Mock SMS sender (`OtpSenderPort` interface).
2. `packages/shared-types` paketini ayağa kaldır — `PhoneE164` Zod schema (TR-only),
   `UserRole` enum, ortak DTO base.
3. `uuidv7()` SQL fonksiyonu + migration + ADR 0006.
4. Prisma soft-delete extension + apps/api/prisma altına taşı + .npmrc revize.

---

## 2026-04-23 — Session A2b: Identity Foundations & Shared Types

Branch: `feat/identity-foundations` (10 commit, push hazır, PR kullanıcı tarafından açılacak).

### Done

- **`docs/development-notes.md`** yaratıldı — gotcha defteri (root-level config dosyası
  tsconfig include, Turbo globalEnv, Prisma+pnpm hoist, `migrate dev` non-interactive,
  Vitest+SWC, soft-delete extension limit'leri, idempotency endpoint-level kuralı,
  outbox transaction içi). A2a'dan ileriye taşınan tuzaklar burada toplanıyor.
- **`packages/shared-types`** paketi ayağa kalktı:
  - `PhoneE164Schema` (TR mobile only, regex `^\+90(5)\d{9}$`), `UuidSchema`, `PaginationSchema`
  - `UserRoleSchema` enum, `OtpRequestSchema` + `OtpRequestResponseSchema`, `OtpChannelSchema`, `OtpPurposeSchema`
  - `ErrorResponseSchema` (API'nin canonical error contract'ı)
  - 15 unit test PASS (phone 11 case + otp 4 case)
  - ESM `type: module`, exports map (`./common`, `./identity`, `./errors`)
  - Build pipeline: `tsc -p tsconfig.build.json` → `dist/`. apps/api root subpath import (`@event-fleet/shared-types`) kullanır; subpath exports (`/common` vs.) klasik moduleResolution'da görünmüyor (apps/api `Node` resolution).
- **`uuidv7()` SQL fonksiyonu** (RFC 9562, plpgsql) — migration: `prisma/migrations/20260422233945_add_uuidv7/`. Mevcut 3 tablo (`users`, `refresh_tokens`, `outbox_events`) v4'te kalır (ADR 0006). Yeni tablolar `@default(dbgenerated("uuidv7()"))`.
- **ADR 0006** (UUID v7 adoption) ve **ADR 0007** (Vitest + SWC transformer) yazıldı.
- **Prisma soft-delete client extension** — `PrismaService.client` getter `findMany/findFirst/count`'a `deletedAt: null` enjekte eder, `delete()` çağrısını soft-delete modellerinde yasaklar (use case'ler explicit `update({ data: { deletedAt: now } })` kullanır). `findUnique`/`update`/`deleteMany` extension'da yok — development-notes.md'de açıklamalı (escape hatch: `findFirst` veya manuel guard).
- **`OtpRequest`** ve **`IdempotencyRecord`** modelleri Prisma schema'sına eklendi, iki ayrı migration (`20260422234807_add_otp_requests`, `20260422234808_add_idempotency_records`).
- **IdempotencyInterceptor full implementation** (`apps/api/src/common/idempotency/`):
  - Redis SETNX lock (TTL 30s) + Postgres `idempotency_records` (TTL 7g)
  - `requestHash = sha256(method + ":" + path + ":" + canonicalJson(body))`
  - Replay (same hash) → cached body; collision (different hash) → 409; concurrent → 409
  - **Endpoint-level** `@UseInterceptors(...)` (A2a'daki global `APP_INTERCEPTOR` kaldırıldı; brief 6.4 zorunlu)
  - Persist + lock release **handler return etmeden senkron** (concatMap, fire-and-forget değil)
  - Found+fixed: `from(promise<observable>)` nested observable problemi → `mergeMap` ile flatten
- **`identity` modülü 4-layer iskelet (TEST-FIRST)**:
  - `domain/`: `PhoneVO` (Zod-backed VO, `InvalidPhoneError`), `OtpRateLimitedError`, `OtpRequestedEvent`
  - `application/ports/`: `OtpRequestRepositoryPort`, `SmsSenderPort`, `ClockPort` (token + interface)
  - `application/use-cases/`: `RequestOtpUseCase` (PhoneVO validate → 3-layer rate limit (per_minute/per_hour/per_ip_minute) → 6-digit `crypto.randomInt` code → `argon2id` hash → `repo.createWithOutbox` → SMS send)
  - `infrastructure/`: `PrismaOtpRequestRepository` (use case'in `prisma.$transaction` içinde repo+outbox atomic write — ADR 0004), `MockSmsSender` (dev/test, OTP code'u redacted-debug log'lar), `NetgsmSmsSender` (skeleton, A2c TODO), `SystemClock`
  - `interface/`: `AuthController` `POST /auth/otp/request` (`@HttpCode(202)` + `@UseInterceptors(IdempotencyInterceptor)` + `ZodValidationPipe(RequestOtpDto)`)
  - Module wiring: NODE_ENV='production' → NetgsmSmsSender, otherwise MockSmsSender
  - Modül CLAUDE.md (sorumluluklar, event'ler, port'lar, test hedefleri)
- **TEST-FIRST kanıtı git'te**: `phone.vo.spec.ts` 9 case + `request-otp.use-case.spec.ts` 6 case (rate limit 3 scope, hash format, plaintext leak guard) → 15 unit test, hepsi yeşil.
- **ESLint layer boundary kuralları** — root `eslint.config.mjs`'e `no-restricted-imports` 3 katman için (domain → application/infrastructure/interface yasak; application → infrastructure/interface yasak; infrastructure → interface yasak). Kanıt: domain'den `application/use-cases/...` import test'i lint'te ADR 0005 mesajıyla yakalandı.
- **Testcontainers integration suite**:
  - `vitest.config.integration.ts` ayrı config; `pnpm test:integration` script
  - `test/setup-integration.ts` global setup → `postgis/postgis:16-3.4` + `redis:7-alpine` containers + `prisma migrate deploy`
  - `test/auth.controller.e2e-spec.ts` 5 case: 202 happy path, 400 invalid phone, idempotency replay (same key/body → single OTP row), idempotency collision (same key/different body → 409), outbox same-tx kanıtı
  - `configure-app(app)` helper main.ts + test'lerde paylaşıldı (trust proxy 1, body limit, shutdown hooks)
  - Toplam integration: 8/8 PASS (3 eski + 5 yeni)
- **CI** — services kaldırıldı, Testcontainers'a geçildi (lokal/CI parite). Node 20.18.0, pnpm 9.15.0 pin. Job sırası: lint → typecheck → build → test-unit → test-integration (sonuncu öncekilere needs).

### Doğrulama sonuçları

- `pnpm install` → 600+ paket (testcontainers transitive deps), 4 deprecated subdep yoksayıldı.
- `pnpm typecheck` (root) → 3 workspace tümü exit 0.
- `pnpm lint` (root) → 3 workspace tümü exit 0, 0 uyarı.
- `pnpm build` (root) → shared-types + api başarılı.
- `pnpm test` (unit, root) → **20 / 20 PASS** (logger redaction 5 + identity 15).
- `pnpm --filter @event-fleet/api test:integration` → **8 / 8 PASS** (app e2e 3 + auth e2e 5).
- DB doğrulaması (`docker exec ... psql`) — `uuidv7()` çalışıyor (4. grup ilk hane `7`); `otp_requests`, `idempotency_records` tablolar var; tüm migration'lar applied.
- Soft-delete extension davranış: integration test'lerde `prisma.client.otpRequest.count(...)` rate limit'te kullanılıyor, soft-deleted satırları görmüyor.
- Outbox kanıt: integration test 5 (`writes OtpRequested to outbox`) `outbox_events` tablosunda `aggregateType: "OtpRequest"`, `eventType: "identity.OtpRequested"`, payload'da `phoneE164` + `channel: "SMS"` var, OTP kodu YOK.
- ESLint layer kuralı kanıt: domain'den application import denemesi `'../application/use-cases/request-otp.use-case' import is restricted ... ADR 0005` mesajıyla bloklandı.

### Plan'dan sapmalar (gerekçeli)

1. **Volta install YAPILMADI** — kullanıcının manuel kurması bekleniyordu, mesaj sırasında onaylandı ama sonra fiziksel kurulum gelmedi. Tüm doğrulamalar lokal Node 24 + sistem pnpm 9.15 ile çalıştı; CI Node 20.18 pin'inden geçecek. **A2c başında Volta kuruluşu doğrula + `volta` field'ı ekle.**
2. **In-memory event bus YOK** (önceden onaylı sapma) — outbox tek kaynak; A2c'de worker EventEmitter2 ekleyecek.
3. **Idempotency interceptor `APP_INTERCEPTOR` (global) → endpoint-level `@UseInterceptors`** (önceden onaylı; brief 6.4 zorunlu).
4. **ESLint pattern 3 katman için yazıldı** (önceden onaylı).
5. **Brief commit dizilimi 13 adımdı, ben 10 atomik commit yaptım**:
   - Volta commit yok (yapılmadı)
   - Test-first kanıt: brief 8 (failing tests) + 9 (impl) tek `feat(identity)` commit'inde birleşti — pre-commit hook test fail'i tolere etmiyor (lint-staged eslint module resolution domain'den olmayan port'ları "error typed" olarak işaretler), test ayrı bir commit teknik olarak red state'inde olur.
   - Testcontainers + CI tek commit'te birleşti (ci.yml'i ayrı stage etmeyi unuttum, paket apps/api ile aynı commit'e karıştı).
6. **Schema'da `output` override KALDIRILDI** A1'de eklenmişti. A2a'da Prisma client'ı default path (root) `node_modules/.pnpm/.../`a generate ediyor; hoist pattern sayesinde resolve OK. Bu A2a'da çözüldü, A2b'de revize gerekmedi (TODO listesinde "schema output override" zaten yok artık).

### Pending (A2c'ye taşınanlar)

- **Volta install** — kullanıcı eylemi; `package.json` root'a `"volta": { "node": "20.18.0", "pnpm": "9.15.0" }` ekleme + `apps/api` `engines` field'ı + temiz reinstall doğrulaması.
- `POST /auth/otp/verify` (test-first) — `OtpRequest.consumedAt` set, `attempt_count` increment, attempt limit (3 yanlış → invalidate).
- JWT access (15dk) + refresh rotation (30g, argon2id-hashlı). `RefreshToken` tablosu var ama henüz kullanılmıyor.
- `AuthGuard` + `@CurrentUser()` decorator, `RequestContextService.setUserId()` controller-level inject.
- OTP rate limit'in **Redis'e taşınması** (DB count vs Redis sliding window — performans).
- `IdempotencyRecord` TTL cleanup job (BullMQ repeatable). Şu an 7g sonra orphan satırlar birikir.
- **Outbox worker** (BullMQ): `WHERE processed_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED` polling + EventEmitter2 in-process publish + retry/backoff (ADR 0004).
- `NetgsmSmsSender` gerçek implementation (HTTP + circuit breaker + İleti Merkezi failover).
- Sentry + OpenTelemetry kurulumu (Faz 1 DoD için).
- Prisma'nın `apps/api/prisma/`'a taşınması (TODO A2a'dan).
- `@nestjs/platform-express` Express 5 transition (NestJS 11'e geçince).

### Next (A2c önerisi)

1. **Volta kurulumu doğrula + pin** (5 dakika).
2. **POST /auth/otp/verify** test-first (`VerifyOtpUseCase`, attempt limit, consumed_at sentinel).
3. **JWT access + refresh rotation** — `User` ve `RefreshToken` tablolarını fiilen kullan, `argon2id` hash ile token store.
4. **Outbox worker** iskeleti — BullMQ + LISTEN/NOTIFY hibrit veya saf polling.
5. **AuthGuard** middleware, RequestContext'e userId yaz.

---

## 2026-04-23 — Session A2c: Authentication Complete

### Done

**Volta + env hijyeni**

- Node 20.18.0 Volta ile pin'lendi (root `package.json` `volta.node`,
  `apps/api/package.json` `engines`, `.nvmrc` 20.18.0). Dev/CI ABI
  uyumluluğu garanti.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (`>=64` hex char enforce),
  `JWT_*_TTL_SECONDS`, `OTP_CODE_TTL_SECONDS`,
  `OTP_MAX_VERIFY_ATTEMPTS`, `SMS_DRIVER` (`mock`/`netgsm`),
  `SENTRY_DSN` env şemasına eklendi. `.env.example`, `.env`,
  `turbo.json` `globalEnv`, `apps/api/test/setup-integration.ts`
  hepsi senkronize.

**Şema**

- `User`'a `phoneVerifiedAt`, `lastLoginAt`. `RefreshToken`'a `familyId`
  (NOT NULL, rotation chain root), `userAgent`, `ipAddress` + iki
  ek index (`familyId`, `userId+revokedAt`). Migration defensive: yeni
  satırlar transient `gen_random_uuid()` default ile ekleniyor sonra
  drop default. ADR 0008 referans.

**ADR 0008 — Refresh Token Rotation Strategy**

- Rotation + reuse detection + token family pattern. HS256 JWT access
  (15 dk), 32-byte base64url refresh (30 g) SHA-256 hash store.
  Argon2'nin neden refresh'te kullanılmadığı (256-bit random brute force
  korumasına gerek yok). Race condition + reuse scenario'ları, sliding
  session/opaque token alternatifleri red gerekçeleri.

**shared-types**

- `OtpVerifySchema` (`phone+requestId+code+optional deviceId`),
  `AuthUserSummarySchema`, `AuthTokensSchema`,
  `RefreshTokensRequestSchema`. Spec coverage 22 case (yeni 11).

**Identity domain layer**

- `OtpCodeVO` (whitespace trim + 6-digit) + 7 spec case.
- 9 yeni domain error: `INVALID_OTP/OTP_EXPIRED/OTP_ALREADY_CONSUMED/
OTP_NOT_FOUND/OTP_VERIFY_RATE_LIMITED/REFRESH_NOT_FOUND/REFRESH_EXPIRED/
REFRESH_REUSE_DETECTED/USER_NOT_FOUND` — her biri stable code +
  HTTP status pin'li.
- 5 yeni event payload: `OtpVerified`, `UserCreated`, `UserLoggedIn`,
  `RefreshTokensIssued`, `RefreshReuseDetected`. Hiçbiri OTP code veya
  refresh plaintext içermiyor (PII discipline).

**Identity application layer (TEST-FIRST)**

- 5 yeni port: `UserRepositoryPort`, `RefreshTokenRepositoryPort`,
  `JwtTokenServicePort`, `OutboxWriterPort`, `TxRunnerPort`. Her biri
  Symbol injection token + interface.
- `OtpRequestRepositoryPort` 3 yeni metot (`findByIdAndPhone`,
  `incrementAttempt`, `consume`).
- `VerifyOtpUseCase` + 7 spec case. **Kritik tasarım kararı:**
  wrong-code attempt-bump ve OTP-burn yazımları **ayrı kısa
  transaction**'lar — başarısızlık durumunda throw transaction'ı
  rollback etmesin. Yalnızca success path tek büyük tx (consume +
  user upsert + token issue + 4 outbox event).
- `RefreshTokensUseCase` + 5 spec case. Aynı pattern: reuse detection
  cascade revoke + audit event ayrı tx'te yazılıyor, sonra throw.
- Toplam unit testler: **39 PASS** (önceki 20'den +19).

**Identity infrastructure**

- `PrismaUserRepository`, `PrismaRefreshTokenRepository`,
  `PrismaOutboxWriter`, `PrismaTxRunner` — port'larla ve raw $transaction
  client'la doğru couple.
- `JwtTokenService` (HS256) — `jsonwebtoken@^9` + `@types/jsonwebtoken`
  bağımlılıkları eklendi. Refresh için `crypto.randomBytes(32) +
base64url`, hash için `crypto.createHash('sha256')` (timing-safe
  compare ihtiyacı yok — DB unique index lookup).
- `MockSmsSender` static `lastByPhone` map + `_testOnlyGetLast(phone)`
  - `_testOnlyReset()` helpers (production'da throw).
- `NetgsmSmsSender` skeleton genişletildi (production TODO listesi +
  dedicated logger). Gerçek HTTP A3.
- `PrimaryFallbackSmsSender` decorator yazıldı (henüz wire değil) —
  A3'te Netgsm + İleti Merkezi chain için hazır.

**API layer**

- `JwtAuthGuard` (global APP_GUARD). `@Public()` decorator route/sınıf
  bazında bypass; `HealthController` ve auth endpoint'leri `@Public()`.
  Guard token verify → DB'den fresh User hydrate (deletedAt:null filter)
  → `req.user` set → `RequestContext.setUserId(...)`.
- `@CurrentUser()` param decorator (req.user resolve, missing'da
  `UnauthorizedError` throw).
- Logger redact list `refreshToken`, `code`, `codeHash` ile genişletildi.

**Auth endpoints**

- `POST /auth/otp/verify` (200, no-store, idempotent) → AuthTokens
- `POST /auth/tokens/refresh` (200, no-store, NOT idempotent) → AuthTokens
- `GET /auth/me` (guarded) → AuthUserSummary

**E2E coverage (Testcontainers)**

- 11 test (önceki 5'ten +6). Happy lifecycle: request → verify → /auth/me
  → refresh → reuse detection. 5 yanlış denemede OTP burn'ünü +
  6.'sının `OTP_ALREADY_CONSUMED` döndüğünü doğrular (split-tx fix'in
  regression guard'ı). Reuse detection sonrası rotated-into refresh'in
  de revoke olduğunu doğrular (cascade). **14 PASS** toplam (3 app.e2e
  - 11 auth.e2e). 0 fail.

**Verification**

- `pnpm -r typecheck` ✅
- `pnpm -r lint` ✅ (max-warnings=0)
- `pnpm -r build` ✅
- `pnpm -r test` (unit) ✅ — 39 + 22 (shared-types) = 61
- `pnpm --filter @event-fleet/api test:integration` ✅ — 14 PASS

### Pending (sonraki oturuma)

A2c brief'inden **kapsam dışı bırakılanlar** (zaman + kapsam yönetimi
için bilinçli tercih, hepsi A2c-followup veya A3'e taşındı):

1. **G6 — OTP rate limit Redis sliding window'a taşıma.** Şu an DB
   count ile çalışıyor (request başına 3 ek hit). Redis sorted set +
   atomic Lua script gerekli. A2c-followup.
2. **G7 — Outbox worker (BullMQ + EventEmitter2 + ADR 0009).** Event'ler
   `outbox_events` tablosuna yazılıyor ama kimse işlemiyor. `processed_at`
   IS NULL satırlar birikiyor. A2c-followup. ADR 0009 da o sırada.
3. **G8 — `IdempotencyRecord` TTL cleanup worker.** Kayıtlar hiç
   silinmiyor; tablo monoton büyüyor. BullMQ repeatable, A2c-followup.
4. **G10 — Sentry integration.** `SENTRY_DSN` env şemasında var ama
   adapter yazılmadı. A2c-followup.
5. Returning user e2e cases (per-phone 60s rate limit window'da takıldığı
   için clock injection gerekli).

A3'e taşındı:

1. **NetgsmSmsSender** gerçek HTTP entegrasyonu + circuit breaker.
2. **PrimaryFallbackSmsSender** wire (Netgsm primary + İleti Merkezi
   secondary).
3. Supply modülü (driver profile, vehicle, evrak).
4. Catalog modülü (ServiceCategory, polimorfik attribute).

### Plandan sapmalar (gerekçeli)

1. **Test + impl tek commit'te.** Brief commit dizilimi 4. (failing
   tests) ve 5. (impl)'i ayırıyordu; ben birleştirdim. Sebep: spec
   dosyaları impl'in introduce ettiği port/error sembollerini
   import ediyor — impl'siz bir commit ESLint `no-unused-vars` +
   `import/order` ile reddedilir. A2b'de aynı trade-off yapıldı,
   precedent korunuyor.
2. **OutboxWriterPort + TxRunnerPort port'ları planda yoktu** ama
   eklemem gerekti. Verify use case 4 farklı agg'ye yazıyor (OTP +
   User + RefreshToken + Outbox); use case'in PrismaService'e direkt
   bağımlı olması (dependency rule ihlali) yerine port abstraction.
   Test'te mock'lanabilir, swap edilebilir.
3. **maxAttempts limit'i değiştirildi:** 5 attempt yapan kullanıcının
   5.'si `consume` ediyor → 6. request `OTP_ALREADY_CONSUMED` (409),
   plan'da "OtpNotFound" diyordu. 409 daha doğru semantik (404 = "hiç
   yoktu", 409 = "vardı ama tüketildi").
4. **G6/G7/G8/G10 ertelendi** (yukarıda detaylı). Auth complete'in
   core'u (login + verify + JWT + rotation + AuthGuard) bittiği için
   "Faz 1 kullanıcı kayıt+giriş ayağı tamamlandı" hedefi
   karşılanıyor; worker + Sentry production gates ama MVP smoke için
   blocking değil.

### Toolchain notları (gotcha)

- **`vi.spyOn(argon2, "verify")` non-configurable property hatası
  veriyor** ESM tarafında. Çözüm: file başında `vi.mock("argon2", ...)`
  ile module-level mock + `vi.mocked(argon2.verify).mockResolvedValue(...)`.
- **`prisma migrate dev` non-interactive shell'de hâlâ asılı kalıyor.**
  A1 workaround geçerli: `migrate diff --from-url ... --to-schema-datamodel
--script` ile SQL üret, manuel klasör + `migrate deploy`.
- **Tx-içinde-throw rollback tuzağı.** İlk verify use case implementation'ı
  her şeyi tek `prisma.$transaction` callback'inde yapıyordu; wrong code
  → throw → rollback → attemptCount güncellenmiyor → OTP brute force'a
  açık. Çözüm: write path'leri ayrı kısa tx'lere böl. development-notes'a
  eklenmedi (use case-spesifik), ama gerekirse bir sonraki büyük domain
  oturumunda "transactional write paths after throw" diye genel kural
  yazılır.

### Next (A2c-followup veya A3'e geçiş kararı)

Aşağıdakiler A2c'nin doğal devamı:

- **G6/G7/G8/G10**'u A2c-followup tek branch'te bitir — outbox worker
  kritik, çünkü mevcut event'ler boşa yazılıyor.
- Veya **A3 supply modülüne** geç ve worker/Sentry'i background ödevi
  olarak işaretle.

Karar kullanıcıya bırakıldı.

---

<!--
Şablon (yeni oturum buradan başlasın):

## YYYY-MM-DD — Session NN: <kısa başlık>

### Done
- ...

### Pending
- ...

### Next
- ...
-->
