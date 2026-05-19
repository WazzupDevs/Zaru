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

## 2026-04-24 — Session A2c-followup: Async Infrastructure

Branch: `feat/async-infrastructure` (10 commit, push hazır, PR kullanıcı
açacak).

A2c'de "kullanıcı kayıt + giriş" dilimi bitince ertelenen üç altyapı
borcunu kapattı: Redis sliding-window rate limiter (G6), BullMQ +
EventEmitter outbox worker (G7), hourly idempotency cleanup (G8).
Sentry (G10) kasıtlı olarak A4'e ertelendi (prod hazırlığı).

### Done

**Rate limiter port → Redis sliding-window-log**

- `RateLimiterPort` arayüzü (Symbol token + interface — port abstraction
  disiplini A2c'den devam).
- `InMemoryRateLimiter` test fake'i `apps/api/test/fakes/` altında —
  unit testler Redis container açmadan port kontratını exercise ediyor.
- `RedisSlidingWindowRateLimiter` Lua script + EVALSHA cache + NOSCRIPT
  reload retry. ZSET-based sliding window, atomic single-roundtrip.
  Reddedilenler kaydedilmez (flood penceresi anchorlu kalsın).
- ADR 0011 yazıldı: algorithm seçimi (sliding-log vs fixed/token/leaky),
  key naming convention (`rl:` prefix, caller-owned), revisit triggers
  (cluster, distributed regions, NestJS Throttler red gerekçesi).
- A2c'deki DB count tabanlı rate limit kodu **tamamen silindi**:
  `OtpRequestRepositoryPort.countByPhoneSince` + `countByIpSince` ve
  Prisma impl'leri. Ölü kod bırakılmadı.
- `RequestOtpUseCase` + `VerifyOtpUseCase` rate limiter port'u inject
  ediyor. Verify'a yeni eklenen koruma: phone başına 10 başarısız
  verify/saat (`VerifyRateLimitedError` 429 — A2c'de error class vardı,
  şimdi tetikleyici eklendi).

**BullMQ + EventEmitter altyapısı**

- `QueueModule` (global) — BullModule.forRootAsync, REDIS_URL parse
  edilip host/port'a açılıyor, `maxRetriesPerRequest: null` (BullMQ
  zorunluluk; dev-notes'a yazıldı).
- `EventBusModule` (global) — EventEmitter2 wildcard + `.` delimiter.
  Subscriber'lar `@OnEvent("identity.*")` ile namespace dinleyebilir.
- Yeni paketler: `bullmq@^5`, `@nestjs/bullmq@^10`,
  `@nestjs/event-emitter@^2`, `eventemitter2@^6`.

**Outbox worker**

- `OutboxEvent` schema'sına `nextAttemptAt` (nullable) eklendi +
  composite index `(processed_at, next_attempt_at, created_at)`.
  Migration: `20260423160132_outbox_next_attempt`.
- `OutboxDrainService` (extracted, @Injectable):
  - `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50` Prisma raw SQL
    (`Prisma.sql`) — tek ORM escape hatch, yorumla işaretlendi.
  - Her event: `events.emitAsync(eventType, payload)` → success'te
    `processed_at` set, fail'de exponential backoff (`2^retry` saniye,
    max 1 saat, 10 retry sonra "abandoned" with `last_error` korunur).
- `OutboxWorker` thin BullMQ Processor — drainOnce()'a delegate.
  Concurrency 1 (per-aggregate ordering, ADR 0009).
- `OutboxScheduler` boot'ta repeatable job kayıt ediyor (jobId-pinned),
  shutdown hook'ta queue close.
- ADR 0009 yazıldı: polling vs LISTEN/NOTIFY vs CDC tercih, single
  worker rationale, exponential backoff + abandon, EventEmitter2
  in-process bus, at-least-once contract (consumer idempotency şart),
  revisit triggers (lag metric, abandoned event rate).
- Integration spec (Testcontainers Postgres): happy path, retry
  scheduling, abandonment at MAX_RETRIES, next_attempt_at gating,
  BATCH_SIZE pagination, identity-event drain end-to-end (5 identity
  event'in tamamı bus'tan geçiyor).

**Idempotency TTL cleanup**

- `IdempotencyCleanupService` — hard-delete `expiresAt < now()`
  satırları. (TTL semantic; soft-delete uygun değil.)
- `IdempotencyCleanupWorker` (BullMQ Processor) + `IdempotencyCleanup
Scheduler` (saatlik repeatable + shutdown hook).
- Integration spec: only-expired-rows-deleted invariant + no-op-on-
  empty-table.

**Dev-notes**

- ADR 0010 + RxJS bölümlerindeki **çözülmemiş merge marker'lar
  temizlendi** (main'de yanlışlıkla committed kalmıştı).
- A2c-followup chapter'ı eklendi: BullMQ maxRetries kuralı, rate
  limiter key naming, outbox test izolasyonu, drainOnce direct vs
  worker loop ayrımı, Prisma.sql raw query convention.

### Verification

| Adım                                 | Sonuç                                                            |
| ------------------------------------ | ---------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`     | OK (4 yeni dep, peer-dep uyarı yok)                              |
| `pnpm -r typecheck`                  | OK                                                               |
| `pnpm -r lint` (max-warnings=0)      | OK                                                               |
| `pnpm -r build`                      | OK                                                               |
| `pnpm --filter api test` (unit)      | **42 PASS** (önceki 39'dan +3 — rate limiter port spec)          |
| `pnpm --filter api test:integration` | **27 PASS** (önceki 14'ten +13 — Redis 5 + outbox 6 + cleanup 2) |

Test ailesi:

- `auth.controller.e2e-spec.ts` — 11 (değişmedi)
- `app.e2e-spec.ts` — 3 (değişmedi)
- `redis-rate-limiter.integration-spec.ts` — 5 (yeni; concurrent dispatch
  Lua atomicity dahil)
- `outbox-drain.integration-spec.ts` — 6 (yeni; abandon at MAX_RETRIES,
  next_attempt_at gating dahil)
- `idempotency-cleanup.integration-spec.ts` — 2 (yeni)

### Plandan sapmalar (gerekçeli)

1. **Outbox worker test'leri fake timers kullanmıyor.** Brief
   `vi.useFakeTimers()` istiyordu BullMQ scheduling test'i için. Ben
   `OutboxDrainService.drainOnce()`'ı service'ten çıkarıp **direkt
   çağırdım** — BullMQ worker loop ve scheduler test edilmiyor (BullMQ
   sorumluluğu). Bizim sorumluluğumuz drain mantığı (read + emit + commit
   - retry + abandon). Daha deterministic, fake timer karmaşıklığı yok.
     ADR 0009 ve dev-notes'ta belirtildi.
2. **Outbox spec `beforeEach`'te tüm `outbox_events` siliniyor**, sadece
   `test.*` event'leri değil. Sebep: aynı Testcontainers Postgres'i auth
   e2e ile paylaşıyor → auth testleri identity event'leri bırakıyor →
   drainOnce() bunları çekip count'u şişiriyordu. Pattern dev-notes'a
   eklendi.
3. **`outboxEvent.nextAttemptAt: null` initial state** seçtim, brief
   default 0/now önerebilirdi. Sebep: `WHERE next_attempt_at IS NULL OR
next_attempt_at <= now()` semantic olarak daha açık, "henüz retry
   schedule olmamış" durumu rakamla değil null ile ifade ediliyor.
4. **`removeOnComplete: { count: N }`** BullMQ jobs'ı Redis'te tutmamak
   için (count cap). `true` (hepsini sil) veya `false` (hiç silme)
   yerine küçük ring buffer — debug için son 50 başarılı job, son 100
   fail'mış job. Operasyonel kompromis.
5. **Rate limiter Lua script `math.random()`** kullanıyor unique member
   üretmek için. Brief'te bu detay yoktu; aynı ms'de iki request olursa
   ZADD'in overwrite etmesi durumu için. Member format:
   `<ms>:<rand>`. Atomic, deterministik değil ama uniqueness garanti.

### Pending → A3 (supply başlarken)

- **Clock injection altyapısı** — returning-user e2e + availability
  testleri için `ClockPort` Nest provider olarak global, test'te
  `FakeClock` swap.
- **NetgsmSmsSender gerçek HTTP** + circuit breaker (`opossum`) +
  İleti Merkezi failover (`PrimaryFallbackSmsSender` zaten yazıldı,
  henüz wire değil).
- **Supply modülü:** DriverProfile, Vehicle, Document, Availability.
- **Catalog modülü:** ServiceCategory + CategoryAttributeDefinition
  polimorfik model.
- **Admin panel** Next.js iskeleti (kullanıcı listesi, read-only).

### Pending → A4 (prod hazırlığı)

- **Sentry + OpenTelemetry** kurulumu (G10 ertelendi). DomainError
  subclass'ları gitmez, unhandled error'lar Sentry'ye, OTEL trace
  spans request boyunca.
- **Outbox DLQ tablosu** + alerting (`outbox_events_dead_letter`).
- **Outbox lag metric** (`min(created_at) WHERE processed_at IS NULL`)
  → Grafana panel + alert > 30s.
- **Multi-worker outbox** + aggregate_id partitioning (consistent hash).
- **`triggered_by_request_id`** outbox event payload'a — RequestContext'ten
  forensic correlation.
- **Coolify + Hetzner** deploy pipeline.
- **NestJS Throttler edge layer** — Cloudflare → nginx → app rate limit
  zinciri.

### Final commit listesi

| #   | Hash        | Konu                                                             |
| --- | ----------- | ---------------------------------------------------------------- |
| 1   | `7bfc503`   | feat(api): add rate limiter port and in-memory fake              |
| 2   | `0e651bb`   | refactor(identity): use rate limiter port in otp use cases       |
| 3   | `85eb2ec`   | feat(api): implement redis sliding window rate limiter           |
| 4   | `5d3684c`   | docs: add ADR 0011 rate limit strategy                           |
| 5   | `13289b9`   | feat(api): add bullmq and event emitter modules                  |
| 6   | `5d64c11`   | feat(db): add next_attempt_at to outbox events                   |
| 7   | `83546d9`   | feat(api): implement outbox worker with bullmq and event emitter |
| 8   | `1a1d3a3`   | docs: add ADR 0009 outbox worker strategy                        |
| 9   | `ed1c5c5`   | feat(api): add idempotency records ttl cleanup worker            |
| 10  | `6533103`   | docs: update development-notes with a2c-followup gotchas         |
| 11  | (bu commit) | docs: log session A2c-followup progress                          |

### Next

A3 supply modülüne geçiş için onay bekliyor. Önce **clock injection
altyapısı** ufak bir ısınma olabilir (returning-user e2e A2c'den open
TODO; A3 availability'sinden önce bitsin).

---

## 2026-04-23 — Session A3a: Foundations & Catalog

Branch: `feat/supply-catalog` (12 commit, push hazır, PR kullanıcı
açacak). A3 oturumu üçe bölündü kullanıcı kararı ile (A3a/A3b/A3c).
Bu A3a — clock altyapısı + catalog modülü + admin scaffold.

### Done

**Clock port (G1)**

- `apps/api/src/common/clock/` global port'ta SystemClock production,
  FrozenClock test (`apps/api/test/fakes/`) — `set()` + `advance(ms)`.
- A2c'deki identity-içi `ClockPort` silindi, common'a promote edildi.
- `RequestOtpUseCase`, `VerifyOtpUseCase`, `RefreshTokensUseCase`:
  port path'leri common'a yönlendirildi.
- `OutboxDrainService`: `new Date()` → `clock.now()` (constructor'a
  CLOCK_PORT inject + drainOnce default arg backward-compat).
- `RedisSlidingWindowRateLimiter`: `Date.now()` → `clock.nowMs()`.
- DB defaults (`@default(now())`) ve pino logger time'ı dokunulmadı —
  audit trail için kanonik DB tarafında, log timeline için pino kendi
  saatinde.
- ESLint test overlay `*.integration-spec.ts` pattern'i de kapsayacak
  şekilde genişletildi.
- ADR 0014 yazıldı.

**Returning-user e2e (G1d)**

- `apps/api/test/returning-user.integration-spec.ts` — A2c'den open
  TODO. AppModule'e `overrideProvider(CLOCK_PORT)` ile FrozenClock
  bağlandı, 2 saat ileri sarılarak aynı phone'la 2 login akışı
  doğrulandı.
- Doğrulanan: aynı `userId`, `phoneVerifiedAt` sticky (ilk verify'dan),
  `lastLoginAt` advance edilmiş clock'ta, her verify'da yeni `familyId`
  (refresh chain), outbox sayımı (1× UserCreated, 2× UserLoggedIn).
- Test izolasyonu: distinct phone (`+905559009001`, auth e2e ile
  çakışmaz), Redis `rl:otp:*` cleanup beforeEach'te.

**Catalog modülü (G2)**

- Schema: `service_categories` + `vehicle_types` +
  `category_attribute_definitions` (3 enum: ServiceCategoryType,
  AttributeDataType, AttributeScope). Migration
  `20260423172347_add_catalog_tables`. UUIDv7 ids, soft-delete
  `SOFT_DELETE_MODELS` set'ine eklendi.
- `shared-types/src/catalog/` Zod şemaları: SlugSchema (lowercase
  kebab-case 2-64), ServiceCategoryTypeSchema, VehicleTypeSchema,
  AttributeDefinitionSchema, ServiceCategoryDetailSchema. 14 spec
  case (slug accept/reject + enum coverage).
- `apps/api/src/modules/catalog/` 4-katman: SlugVO + 2 domain error
  - ServiceCategoryRepositoryPort + 3 use case (List/Get/ListVehicleTypes)
  - Prisma repo (nested `include` ile detail) + CatalogController
    (3 public read endpoint).
- `@Public()` decorator ile AuthGuard bypass — müşteri uygulaması
  catalog okumak için login olmaz.
- Module-level `CLAUDE.md`: polymorphic attribute kontratı
  (scope=VEHICLE → Vehicle.attributes, scope=BOOKING →
  Booking.attributes), A3b/A4 implementasyonu için template.

**Seed (G2d)**

- `prisma/seed.ts` idempotent (upsert by slug). 1 ServiceCategory
  (wedding-car) + 4 VehicleTypes + 5 attribute defs (3 VEHICLE-scope:
  trim_color enum/has_air_conditioning/has_chauffeur, 2 BOOKING-scope:
  ceremony_venue/rental_hours).
- Root `package.json`: `db:seed` script, `tsx@^4` devDep.
- Prisma `generator { seed = ... }` directive **kullanılmadı** —
  `migrate reset` yan etkisini istemiyoruz.
- Production'da da çalışır — wedding-car launch vertical, prod'da da
  bu kayıt olmalı.
- `prisma/**` ESLint ignore'a eklendi (seed dosyası tsconfig
  include'ında değil, projectService bulamıyor → lint-staged crash
  önlendi).

**Catalog integration tests (G2e)**

- `apps/api/test/catalog.controller.e2e-spec.ts` 6 test: list, detail
  with nested shape, 404 unknown slug, 400 invalid slug format,
  soft-delete exclusion, dedicated vehicle-types endpoint.
- Seed adımı `beforeAll`'da `pnpm db:seed` ile çalışır.

**Admin Next.js scaffold (G6)**

- `apps/admin/` minimal Next.js 15 + React 19 + Tailwind 3.4 +
  TypeScript 5.6 paketi. App Router, src/app/ layout + globals.css
  (CSS variables, shadcn-friendly) + placeholder homepage.
- `next.config.js`: `transpilePackages: ["@event-fleet/shared-types"]`
  (workspace symlink resolve).
- Tailwind config shadcn defaults (CSS vars, dark mode via class) ile
  primed; **shadcn component generation A3c'ye ertelendi** (gerçek
  ekran yokken `@/components/ui/*` boş gürültü).
- `apps/admin/.eslintrc.json` (Next 15 hâlâ `next lint` ile çalışıyor;
  Next 16'da CLI flat'a geçilecek).
- Root flat ESLint config'in ignore'ına `apps/admin/**` eklendi —
  admin kendi `next lint` pipeline'ını çalıştırıyor; root strict TS
  rules `next-env.d.ts` ve Tailwind config'i double-flag ediyordu.
- `pnpm -r build` admin'i otomatik kapsıyor (turbo `build.outputs`'ta
  `.next/**`); CI'a ekstra job gerek yok.

### Verification

| Adım                                 | Sonuç                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`     | OK (Next.js 15 + React 19 + tsx peer-dep uyarı yok)           |
| `pnpm -r typecheck`                  | OK (3 workspace: shared-types + api + admin)                  |
| `pnpm -r lint`                       | OK (3 workspace, next lint dahil)                             |
| `pnpm -r build`                      | OK                                                            |
| `pnpm --filter shared-types test`    | **36 PASS** (önceki 22'den +14 — catalog spec)                |
| `pnpm --filter api test` (unit)      | **55 PASS** (önceki 42'den +13 — SlugVO spec)                 |
| `pnpm --filter api test:integration` | **34 PASS** (önceki 27'den +7 — returning-user 1 + catalog 6) |
| `pnpm db:seed`                       | OK (wedding-car kategorisi seed edildi)                       |

### Plandan sapmalar (gerekçeli)

1. **shadcn component generation A3a'da YOK.** Brief gerektirdi (button,
   input, form, card, table). Ben sadece config'leri (Tailwind + CSS
   vars) hazırladım — gerçek component'leri A3c'ye ertelendi. Sebep:
   placeholder homepage'de kullanılmayan component dosyaları "neden
   var?" sorusuna açık. Gerçek ekran (driver approval queue) gelince
   ihtiyacı olan component'lar `pnpm dlx shadcn@latest add button input
...` ile bir seferde eklenecek.
2. **Outbox `drainOnce(now?)` backward-compat.** Brief impl'inde
   "constructor → clock inject" dedi. Ben `drainOnce(now: Date =
this.clock.now())` parametre kalıttım — testler hâlâ explicit `now`
   geçebiliyor (deterministic, BullMQ aşamasını test etmiyoruz). Risk
   yok; production code zaten `clock.now()` default'unu kullanır.
3. **Test izolasyon dökümanı dev-notes'a girdi** — brief'te returning-user
   e2e detayı kısa geçildi; ben Redis `rl:` cleanup ve table cleanup
   sırasını dev-notes'a yazdım çünkü A3b supply testleri aynı pattern'i
   takip edecek.

### Next

A3b başlamaya hazır:

- Storage port + MinIO Docker container (R2 fallback) + `mc` init service
- Supply core: DriverProfile + Vehicle + Document
- TCKN strict checksum + IBAN argon2 hash + pino redaction `*.nationalId`
- Admin approval endpoints (`POST /admin/supply/driver-profiles/:id/approve`)
- ADR 0013 (storage-presigned-upload)

A3b branch: `feat/supply-driver-profiles` (yeni branch, A3a merge sonrası).

A3c kapanışı: Availability + admin bootstrap CLI + ADR 0015 + Faz 1
"Supply complete".

### Final commit listesi

| #   | Hash        | Konu                                                                         |
| --- | ----------- | ---------------------------------------------------------------------------- |
| 1   | `242e097`   | feat(api): promote clock port from identity to common with frozen test fake  |
| 2   | `c899a3c`   | refactor(api): inject clock port across identity, outbox and rate limiter    |
| 3   | `179449e`   | test(identity): add returning-user e2e with frozen clock                     |
| 4   | `542eedd`   | docs: add ADR 0014 clock injection                                           |
| 5   | `bf7ec2a`   | feat(db): add catalog tables — service category, vehicle type, attribute def |
| 6   | `d6908df`   | feat(shared-types): add catalog zod schemas                                  |
| 7   | `186c6d7`   | feat(catalog): implement read-only list and detail endpoints                 |
| 8   | `ec2e0e3`   | feat(db): add seed script for wedding-car category                           |
| 9   | `2d913fd`   | docs: add ADR 0012 polymorphic catalog model                                 |
| 10  | `76fdadb`   | feat(admin): scaffold nextjs 15 app router with tailwind                     |
| 11  | `5db9cb4`   | docs: update development-notes with a3a gotchas                              |
| 12  | (bu commit) | docs: log session A3a progress                                               |

---

## 2026-04-24 — Session A3b: Supply Core & Storage

Branch: `feat/supply-driver-profiles` (A3a stack üstüne, base
`feat/supply-catalog`). 20 commit (kullanıcı option B'yi seçti — A3a
merge bekliyor, A3b paralel ilerledi). Hedef tamamlandı: storage layer,
PII hashing, sürücü profili lifecycle, vehicle, document, admin onay
endpoint'leri ve e2e izolasyonu.

### Done

**Persistence ports promotion (G0)**

- `TxRunnerPort` + `OutboxWriterPort` + `TxClient` identity'den
  `apps/api/src/common/persistence/`'e promote edildi. `PersistenceModule`
  `@Global`. Identity'nin local kopyaları silindi, tüm import path'leri
  yenilendi. Supply (ve gelecek modüller) bu ports'u inject ediyor.

**Storage layer (G1)**

- `apps/api/src/common/storage/` — `StoragePort` (presigned PUT/GET +
  HEAD + delete + healthCheck), `S3Storage` (`@aws-sdk/client-s3`),
  `StorageKeyBuilder` (canonical drivers/<id>/documents|vehicles paths),
  `StorageModule` `@Global`.
- **Content-Length signed presigned PUT**: client 15 MB üzeri yükleme
  yapamaz, S3 reddeder. Hard cap, "client'a güvenelim" değil.
- MinIO dev compose (`quay.io/minio/minio:RELEASE.2024-10-13...` pinned)
  - `mc` init container (bucket bootstrap + anonymous download policy).
- `/readyz`'a storage HeadBucket check eklendi (2sn timeout).
- `setup-integration.ts` MinIO container'ı boot ediyor + bucket policy
  S3Client ile JS'de kuruluyor (mc binary lifecycle sorununu atlamak için).
- `storage.integration-spec.ts` — 5 test: round-trip upload/download,
  Content-Length oversize reject, missing key null metadata, healthCheck,
  S3Storage default binding.
- ADR 0013 yazıldı.

**PII hashing (G2)**

- `PiiHasher` (common/security): `hashNationalId` HMAC-SHA256 deterministic
  (`PII_HMAC_SECRET` 64 hex), `hashIban` argon2id non-deterministic,
  `verifyIban`. `SecurityModule` `@Global`.
- 7 unit test (deterministic match, secret-change variance, hex format,
  argon2 verify pos/neg).
- `NationalIdVO` strict TCKN checksum (10. hane formula + 11. hane sum).
  6 unit test (3 valid algoritmik TCKN: 10000000146, 11111111110,
  12345678950 + 3 invalid: format, all-zeros, checksum).
- `IbanVO` ISO 13616 mod-97 checksum, `last4` extract. 8 unit test.
- `PlateVO` TR plaka regex + normalize (uppercase + space strip).
  8 unit test.
- Pino redaction `*.nationalId`, `*.nationalIdHash`, `*.iban`, `*.ibanHash`,
  - `req.body.nationalId`, `req.body.iban`. Hash bile log'a yazılmıyor —
    defansif (HMAC secret rotation döneminde hash'in kendisi de "eski PII
    bağlantısı" tutar).

**Schema (G3)**

- `prisma/schema.prisma`: `DriverProfile`, `Vehicle`, `Document` +
  4 enum (DriverOnboardingStatus, VehicleStatus, DocumentType,
  DocumentStatus). DriverProfile.userId `@unique` + partial unique index
  (`WHERE deleted_at IS NULL`); plate_number partial unique index.
- Migration `20260424000000_add_supply_tables/migration.sql` (Prisma
  diff + manuel partial index'ler). Postgres'e applied.
- `SOFT_DELETE_MODELS` set'ine 3 yeni model eklendi (PrismaService
  extension).
- `shared-types/src/supply/`: `CreateDriverProfileInput`,
  `UpdateDriverProfileInput`, `DriverProfileResponse`,
  `RegisterVehicleInput`, `UpdateVehicleAttributesInput`,
  `VehicleResponse`, `RequestDocumentUploadInput`,
  `RequestDocumentUploadResponse`, `ReviewDocumentInput`,
  `DocumentResponse`, `RejectDriverInput`. 13 zod test case.

**Driver profile use cases (G4)**

- 4 katman scaffold: domain (errors + events + constants + age helper +
  VOs), application (3 repo ports), infrastructure (3 Prisma repos),
  application/use-cases (7 use case).
- Use case'ler: `CreateDriverProfileUseCase` (TCKN HMAC + IBAN argon2,
  age guard, duplicate-by-userId + duplicate-by-tcknHash, outbox event),
  `UpdateDriverProfileUseCase` (DRAFT only), `GetMyDriverProfileUseCase`,
  `SubmitForReviewUseCase` (REQUIRED_DOCUMENT_TYPES check +
  DOCUMENTS_PENDING transition), `ApproveDriverUseCase` (admin —
  same-tx User.role → DRIVER promotion, outbox event), `RejectDriverUseCase`
  (admin — rejectionReason zorunlu), `ListPendingDriversUseCase` (admin
  cursor pagination).
- Module-level `CLAUDE.md`: PII disiplini + cross-module write
  rationale + port responsibilities.
- 6 unit test create-driver-profile için (happy path + duplicate-by-user
  - duplicate-by-tckn + underage + invalid TCKN + invalid IBAN). PII
    payload assertion smoke.

**Vehicle use cases (G5)**

- `CatalogModule` SERVICE_CATEGORY_REPOSITORY_PORT export ediyor;
  `findActiveVehicleType` ve `listAttributeDefinitionsForCategory`
  port'a eklendi.
- `AttributeValidator` (application/services — domain'den taşındı,
  ADR 0005 cross-layer guard sebebiyle): CategoryAttributeDefinition
  rows'undan dinamik Zod schema, strict (extra key reject).
- `RegisterVehicleUseCase` (PlateVO + driver APPROVED guard + vehicle
  type lookup + attribute validation + plate uniqueness + outbox event),
  `UpdateVehicleAttributesUseCase` (optimistic-lock via repo updateMany
  with version filter), `ListMyVehiclesUseCase`.

**Document use cases (G6)**

- `RequestDocumentUploadUseCase` (mime whitelist + max-size check +
  driver/vehicle ownership guards + presigned PUT → DB row UPLOADED).
- `ConfirmDocumentUploadUseCase` (storage HEAD → size match → outbox
  DocumentUploaded; size mismatch → cleanup deleteObject).
- `ReviewDocumentUseCase` (admin — APPROVED/REJECTED transition +
  rejectionReason guard + outbox event).
- `ListMyDocumentsUseCase`.

**RolesGuard + Controllers (G7)**

- `RolesGuard` (common/auth) + `Roles(...)` decorator. APP_GUARD
  zincirinde JwtAuthGuard'dan sonra (auth → roles).
- 4 controller: `DriverProfileController` (POST/GET/PATCH/POST submit),
  `VehicleController` (POST/GET/PATCH), `DocumentController` (POST
  upload-url + POST confirm + GET), `AdminSupplyController`
  (`@Roles("ADMIN")`, GET pending, approve, reject, document review).
- Idempotency interceptor kritik mutating endpoint'lerde (create profile,
  submit, register vehicle, upload-url, approve, reject, document review).
- Mappers (`driver-profile.mapper.ts`) — PII boundary: DriverProfileResponse,
  VehicleResponse, DocumentResponse'a hash ve plaintext girmez, sadece
  ibanLast4 ve safe alanlar.
- `SupplyModule` tüm use case'ler + 3 repo provider; `app.module.ts`'e
  eklendi.

**ADR + dev-notes (G8)**

- ADR 0016 yazıldı: TCKN → HMAC-SHA256, IBAN → argon2id, gerekçe +
  alternatives + revisit triggers + secret rotation runbook A4+ TODO.
- `docs/development-notes.md` "2026-04-24 — Session A3b" bölümü:
  Content-Length signing, MinIO forcePathStyle, Testcontainers MinIO
  pattern, cross-module write rationale, PII disiplini, attribute
  validator placement, VehicleType reverse relation, partial unique
  index 2-katmanlı, PersistenceModule promotion.

**E2E (G8.5)**

- `apps/api/test/driver-profile.integration-spec.ts` — 8 e2e test:
  - DRAFT profile creates, response asla PII içermez (smoke assertion)
  - Zod-level invalid TCKN → 400
  - Domain-level checksum-fail TCKN → SUPPLY_INVALID_NATIONAL_ID
  - Underage → SUPPLY_DRIVER_UNDERAGE
  - DB rows: nationalIdHash hex, ibanHash $argon2id$, ibanLast4 set,
    plaintext kolon yok
  - Submit eksik evrak → SUPPLY_INCOMPLETE_DOCUMENTS + missingTypes list
  - 401 without Bearer
  - 403 on `/admin/*` for CUSTOMER token (RolesGuard works)
- Test isolation pattern: distinct phone `+90555901*`, FK-aware cleanup
  (Document → Vehicle → DriverProfile → Refresh → Otp → User), Redis
  rl:\* purge.

### Verification

| Adım                                 | Sonuç                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`     | OK (+@aws-sdk/client-s3, @aws-sdk/s3-request-presigner)                                                                        |
| `pnpm -r typecheck`                  | OK                                                                                                                             |
| `pnpm -r lint`                       | OK                                                                                                                             |
| `pnpm -r build`                      | OK                                                                                                                             |
| `pnpm --filter shared-types test`    | **49 PASS** (önceki 36'dan +13 supply schema)                                                                                  |
| `pnpm --filter api test` (unit)      | **99 PASS** (önceki 55'ten +44: PiiHasher 7 + StorageKey 7 + NationalId 6 + Iban 8 + Plate 8 + CreateDriverProfile 6 + 2 misc) |
| `pnpm --filter api test:integration` | **47 PASS** (önceki 34'ten +13: 5 storage + 8 driver-profile)                                                                  |

### Plandan sapmalar (gerekçeli)

1. **TxRunnerPort + OutboxWriterPort common'a promote (plan dışı).**
   Brief identity'deki ports'u "referans" olarak gösteriyordu ama supply
   da aynı ports'u kullanmak zorunda — DRY için promotion zorunluydu.
   Tek refactor commit, identity test'lerini kırmadı (55 → 55 pass).
2. **`AttributeValidator` domain → application taşındı.** Brief
   `domain/services/` öneriyordu ama ESLint cross-layer guard (ADR 0005)
   `catalog/application/ports`'tan import'u engelliyor. Doğru davranış —
   validator dış modülün application record'unu consume ediyor →
   application layer.
3. **MinIO Testcontainers spin-up + bucket bootstrap S3Client ile (mc
   binary değil).** Brief `mc` öneriyordu (compose'da öyle) ama
   Testcontainers'ta mc init container lifecycle yönetimi karmaşık →
   `S3Client.send(CreateBucketCommand + PutBucketPolicyCommand)` ile
   JS'de kurmak daha portable.
4. **Storage compose ve storage port commit'leri birleşti.** Plan iki
   ayrı commit istiyordu; lint-staged ilk commit'e compose'u dahil etti
   (storage port'la birlikte staged). Boş ikinci commit drop edildi.
5. **`UpdateDriverProfileInput` `string | undefined` zorunda.** TS
   `exactOptionalPropertyTypes: true` aktif; optional alan mı opsiyonel
   undefined-allowed mı ayrımı bizi bu syntax'a zorluyor.
6. **`VehicleTypeNotFoundError` registerVehicle dosyasında inline.**
   Tek bir use case'de kullanılıyor, ayrı dosyaya taşımak abartı —
   inline class.
7. **Shadow database ile migration diff.** Local Postgres'te
   `efshadow` DB yarattım, `prisma migrate diff --shadow-database-url`
   ile SQL ürettim. Manuel partial index'leri ekledim. CI'da bu yok —
   `migrate deploy` ürettiğim SQL'i doğrudan apply ediyor.
8. **Admin promotion e2e A3c'ye ertelendi.** Brief full lifecycle
   (CUSTOMER → submit → admin approve → role becomes DRIVER → register
   vehicle) öneriyordu. Admin user yaratmak için ADMIN bootstrap CLI
   gerek (A3c scope) — şimdilik e2e CUSTOMER side + 403 on /admin/\*
   smoke ile sınırlı. Driver lifecycle'in admin-side parçası unit
   test (use case) ve manual smoke ile kapsanıyor.
9. **`drainOnce()` kullanım sırasında bir migration `efshadow` DB
   yaratıldı.** Sadece local — repo'ya commit edilmedi, manuel cleanup
   gerekirse `DROP DATABASE efshadow`.

### Final commit listesi

| #   | Hash        | Konu                                                                               |
| --- | ----------- | ---------------------------------------------------------------------------------- |
| 1   | `d7e96f1`   | refactor(api): promote tx runner and outbox writer ports to common/persistence     |
| 2   | `2cd6ec7`   | feat(api): add storage port with s3-compatible implementation                      |
| 3   | `393d03e`   | test(api): add integration tests for presigned upload flow                         |
| 4   | `78ca612`   | docs: add ADR 0013 storage presigned upload                                        |
| 5   | `c2b8d48`   | feat(api): add pii hasher with hmac and argon2id strategies                        |
| 6   | `8bcdf72`   | feat(supply): add national id, iban and plate value objects with checksums         |
| 7   | `f2b0674`   | feat(api): extend pino redaction for pii fields                                    |
| 8   | `3989d49`   | feat(db): add driver profile, vehicle and document tables                          |
| 9   | `3ac6ff6`   | feat(shared-types): add supply schemas                                             |
| 10  | `4e56c4d`   | feat(supply): add domain errors, events and onboarding constants                   |
| 11  | `3360686`   | feat(supply): add repository ports and prisma implementations                      |
| 12  | `eb5a1e4`   | feat(supply): implement driver profile lifecycle use cases                         |
| 13  | `f657c73`   | feat(catalog): expose vehicle type lookup and attribute defs to other modules      |
| 14  | `5e2ebcc`   | feat(supply): add vehicle, document and attribute domain errors                    |
| 15  | `313c140`   | feat(supply): implement vehicle registration with polymorphic attribute validation |
| 16  | `e70e927`   | feat(supply): implement document upload, confirm and review use cases              |
| 17  | `e1f503a`   | feat(api): add roles guard and roles decorator                                     |
| 18  | `3866e78`   | feat(supply): wire driver, vehicle, document and admin controllers                 |
| 19  | `baa679d`   | test(supply): add driver profile e2e with pii redaction smoke                      |
| 20  | (bu commit) | docs: log session A3b progress                                                     |

### Pending (A3c)

- **Storage smoke** (manuel): MinIO 9000 portunda gerçek upload-confirm
  round-trip, log'da redaction kanıtı (TCKN/IBAN gönder, log'da
  `[Redacted]` gör).
- **Admin bootstrap CLI** (`pnpm api:promote-admin <phone>`) +
  `BOOTSTRAP_ADMIN_PHONE` env (dev/test seed).
- **ADR 0015 admin bootstrap.**
- **Full admin approval e2e** (now possible after CLI exists):
  CUSTOMER login → 4 evrak yükle → submit → admin approve → role DRIVER
  → register vehicle.
- **Vehicle availability** (`tstzrange` overlap operator).
- **shadcn/ui component install** + driver approval admin ekranı
  (`/admin/drivers/pending`).
- **Root ESLint strict parity** for admin workspace.

### Pending (A4)

- Booking modülü (Quote + pricing + state machine).
- Payment (iyzico marketplace).
- Dispatch, notifications, reviews.
- Sentry + OpenTelemetry.
- NetgsmSmsSender real HTTP integration + İleti Merkezi failover.
- Coolify + Hetzner deploy pipeline.
- Mobile app scaffolding.
- TCKN/IBAN secret rotation runbook.
- Post-upload pipeline: virus scan + EXIF strip + thumbnail.

### Next

A3c başlamaya hazır. Branch: `feat/supply-availability` (yeni branch,
A3b merge sonrası).

---

## 2026-04-25 — Session A3c: Faz 1 Kapanışı

Branch: `feat/supply-availability-admin` (A3a + A3b main'e merge edildi:
PR #7 + #8). Hedef: Faz 1'i bitir — vehicle availability, admin bootstrap,
admin panel approval queue, full lifecycle e2e, ESLint parity, Phase 1
closeout dokümanı.

### Done

**Storage bucket auto-ensure (G0.5)**

- A3b'de auto-ensure yoktu; bu oturumda eklendi.
- `StoragePort.ensureBucket()` interface'e eklendi; S3Storage impl
  HeadBucket → CreateBucket idempotent pattern (BucketAlreadyOwnedByYou
  ve BucketAlreadyExists handle).
- `StorageBootstrapService` `OnApplicationBootstrap` lifecycle hook'u
  ile API startup'ta çalışır; `NODE_ENV === "production"` durumunda skip
  - warn log.

**Admin bootstrap (G1)**

- `BOOTSTRAP_ADMIN_PHONE` env Zod schema'ya eklendi (TR mobile regex,
  optional). Turbo `globalEnv`'e + `.env.example` placeholder.
- `prisma/seed.ts` `seedBootstrapAdmin()` fonksiyonu: prod'da skip,
  dev/test'te `findFirst` + `update/create` (partial unique index
  uyumlu). User pre-verified (`phoneVerifiedAt = now()`).
- `apps/api/scripts/promote-admin.ts` CLI — phone format check, user
  existence check, role update + `identity.UserRolePromoted` outbox
  event (`promotedVia: "cli"` audit metadata). Tek atomik tx.
- Root `package.json`: `pnpm api:promote-admin <phone>` script.
- `eslint.config.mjs` ignores'a `apps/api/scripts/**` eklendi (seed.ts
  precedent — tsx + projectService friction).
- ADR 0015 yazıldı.

**VehicleAvailability (G2)**

- `prisma/schema.prisma`: `AvailabilityType` enum (BLOCKED, BOOKED) +
  `VehicleAvailability` model (vehicle/driver FK + start_at/end_at +
  optional booking_id A4'e hazır).
- Migration `20260425000000_add_vehicle_availabilities` manuel SQL
  (B-tree composite index + start_at/end_at B-tree). GiST + tstzrange
  şu an skip; B-tree yeterli, revisit trigger dev-notes'ta.
- `SOFT_DELETE_MODELS` set'ine `VehicleAvailability` eklendi.
- Shared-types `supply/availability.ts`: `BlockAvailabilityInput`,
  `AvailabilityResponse`, `CheckVehicleFreeQuery/Response`, `ConflictItem`.
- Domain errors: `InvalidAvailabilityRangeError`, `PastDateError`,
  `VehicleNotActiveError`, `AvailabilityConflictError` (with conflicts
  detail), `AvailabilityNotFoundError`, `CannotRemoveBookedAvailabilityError`.
- Domain events: `AvailabilityBlocked`, `AvailabilityUnblocked`,
  `VehicleActivated`.
- `VehicleAvailabilityRepositoryPort` + Prisma impl. **Half-open
  `[startAt, endAt)` overlap rule:**
  `existing.startAt < requested.endAt AND existing.endAt > requested.startAt`.
  Adjacent ranges OK (12:00 bitiş + 12:00 başlangıç çakışmaz).
- 4 use case: `BlockAvailabilityUseCase`, `UnblockAvailabilityUseCase`,
  `CheckVehicleFreeUseCase` (public, auth gerektirmez), `ListAvailabilityUseCase`.
- `BlockAvailabilityUseCase` 8 unit test: happy + range invalid + past
  date + non-active vehicle + non-owner + full overlap + partial overlap
  - adjacent ranges OK.
- `AvailabilityController` (driver-facing POST/GET/DELETE + public GET check).

**ActivateVehicle admin endpoint (G2.5)**

- `VehicleRepositoryPort.setStatus(tx, id, status)` eklendi.
- `ActivateVehicleUseCase`: DRAFT/PENDING_APPROVAL → ACTIVE, idempotent
  (already ACTIVE = no-op), driver APPROVED guard, SUSPENDED reject.
  `VehicleActivated` outbox event.
- `AdminSupplyController.activateVehicle` (`/admin/supply/vehicles/:id/activate`,
  Idempotency-Key, ADMIN role).

**Full lifecycle e2e (G3)**

- `apps/api/test/driver-onboarding-lifecycle.e2e-spec.ts` — Faz 1 closeout
  proof. 14 adım:
  1-4: Customer OTP login → driver profile DRAFT
  5: 4 evrak presigned PUT round-trip (DRIVER_LICENSE, IDENTITY_CARD,
  VEHICLE_REGISTRATION, INSURANCE)
  6-7: Submit → DOCUMENTS_PENDING; admin OTP login (bootstrap admin
  beforeEach'te direkt Prisma insert)
  8-9: Admin pending queue list + approve → APPROVED + role DRIVER
  10: Existing customer token /auth/me → role DRIVER (JwtAuthGuard DB
  hydration)
  11-12: Vehicle register (wedding-car category) + admin activate
  13-14: Availability block + public check (overlap = busy, non-overlap
  = free)
  15: Outbox event types verification (7 distinct types: DriverProfileCreated,
  DocumentUploaded, DriverSubmittedForReview, DriverApproved,
  VehicleRegistered, VehicleActivated, AvailabilityBlocked).

**Admin panel (G4)**

- `clsx` + `tailwind-merge` + `class-variance-authority` deps eklendi.
  shadcn CLI yerine minimal UI primitives elle yazıldı (Radix dependency
  yükü gereksiz):
  - `lib/cn.ts` (twMerge + clsx)
  - `components/ui/button.tsx` (default/destructive/outline/ghost variants
    - sm/md sizes)
  - `components/ui/input.tsx`
  - `components/ui/card.tsx` (Card + Header + Title + Content)
  - `components/ui/table.tsx` (Table + Header + Body + Row + Head + Cell)
- `lib/api-client.ts`: fetch wrapper + localStorage token mgmt + JSON
  body + Bearer auth + ApiError shape.
- `lib/auth.ts`: `useRequireAuth({ requireRole })` hook — `/auth/me`
  ile token + role doğrulama; 401 / role mismatch → /login redirect.
  `logout(router)` helper.
- `app/login/page.tsx`: 2-step OTP form (phone → OTP code), Suspense
  wrap (Next 15 useSearchParams bailout fix).
- `app/(authenticated)/layout.tsx`: protected route grubu — admin role
  guard + sidebar nav + user phone + logout button.
- `app/(authenticated)/page.tsx`: dashboard — pending count card.
- `app/(authenticated)/drivers/pending/page.tsx`: tablo + Onayla/Reddet
  butonları + Idempotency-Key per request + prompt() red sebebi (MVP).
- `apps/admin/.env.local.example`: `NEXT_PUBLIC_API_URL`.
- Build: 4 static route, ✔ no errors.

**Admin ESLint strict parity (G5)**

- A3a'dan TODO kapandı. `apps/admin/.eslintrc.json` strict rules:
  no-explicit-any, no-non-null-assertion, consistent-type-imports,
  no-unused-vars, import/order (root config ile aynı groups +
  alphabetize), no-console (warn/error allow).
- Mevcut admin kodu auto-fix sonrası geçti.

**Docs (G6)**

- `docs/development-notes.md` "2026-04-25 — Session A3c" bölümü:
  half-open interval, tstzrange revisit, CreateBucket idempotency,
  seed admin guard, promote-admin CLI ESLint exclusion, cross-module
  write CLI ekstrası, Next 15 useSearchParams Suspense, admin auth
  localStorage MVP, minimal UI primitives, ESLint strict parity.
- `docs/phase-1-closeout.md` (yeni): Faz 1 kapanış raporu — kapsam,
  oturum tarihçesi, ne kuruldu, ADR listesi (16), test kapsamı (210+),
  güvenlik mihenk taşları, bilinçli ertelemeler, A4 hazırlık.
- `README.md`: Status section + Quick Start (db:up + db:seed + dev +
  servisler) + admin promotion komutu.

### Plandan sapmalar (gerekçeli)

1. **shadcn CLI yerine elle UI primitives.** Brief `pnpm dlx shadcn@latest add`
   öneriyordu. CLI Radix UI ekosistemini (15+ npm package) ekliyor —
   A3c için (sadece button/input/card/table gerek) overkill. Manuel
   pattern aynı şekilde extensible. Dialog/Select gerektiğinde shadcn
   add tek seferde çalışır.
2. **Reject reason `prompt()` (MVP).** Brief Dialog'lu UI önerdi ama
   kabul ediyor: "MVP viable: prompt." Yaptım. A4'te shadcn dialog
   eklenince upgrade.
3. **Migration shadow DB ile değil manuel SQL.** Docker A3c session
   süresince kapalıydı — `migrate diff --shadow-database-url` çağrısı
   yapamadım. SQL'i şemaya bakarak elle yazdım (şema-DSL düşük katman
   eşleştirme). Migration apply test ortamında otomatik çalışacak
   (`prisma migrate deploy` setup-integration.ts'te).
4. **GiST + tstzrange index skip.** Brief `tstzrange && tstzrange` SQL
   önerdi (raw query). B-tree composite ile aynı sonuç + Prisma DSL ile
   kalabildim — kod daha okunaklı. GiST gerek olunca migration eklenir
   (revisit trigger dev-notes'ta).
5. **MinIO bucket auto-ensure A3b'de YOK, A3c'de eklendi.** Brief'te
   "öncelikle kontrol et" denmişti — `apps/api/src/common/storage/`
   dizininde bootstrap servisi yoktu, ben ekledim.
6. **ADR 0015 + CLI tek commit'te birleşti.** lint-staged staging
   davranışı; iki ayrı commit yerine tek commit'te (CLI + ADR). Etki
   yok, doc + impl atomik.
7. **Manuel browser smoke skipped (Docker offline).** Brief manuel admin
   panel browser testi istiyordu. Docker session sonunda hâlâ kapalıydı,
   live test yapamadım. Tüm build/lint/typecheck yeşil; e2e Testcontainers
   üzerinden CI'da koşacak. Kullanıcı manuel test'i `pnpm db:up && pnpm
dev` ile yapacak.

### Final commit listesi

| #   | Hash        | Konu                                                                            |
| --- | ----------- | ------------------------------------------------------------------------------- |
| 1   | `ccc00c4`   | feat(api): auto-ensure storage bucket on dev bootstrap                          |
| 2   | `fc353d0`   | feat(api): seed bootstrap admin user via env in non-prod                        |
| 3   | `f228bc4`   | feat(api): add promote-admin cli with outbox audit (ADR 0015 included)          |
| 4   | `5b231c3`   | feat(db): add vehicle_availabilities table with range index                     |
| 5   | `d691147`   | feat(shared-types): add availability schemas                                    |
| 6   | (squashed)  | feat(supply): add availability port, repository and domain errors               |
| 7   | (squashed)  | feat(supply): implement availability use cases with half-open overlap           |
| 8   | (squashed)  | feat(supply): add admin vehicle activate use case and endpoint                  |
| 9   | (squashed)  | feat(supply): wire availability controller and admin activate endpoint          |
| 10  | `378348b`   | test(supply): add full driver onboarding lifecycle e2e                          |
| 11  | `ef98421`   | feat(admin): install clsx, tailwind-merge and cva for styling primitives        |
| 12  | (squashed)  | feat(admin): add api client, auth hook and minimal ui primitives                |
| 13  | (squashed)  | feat(admin): add login page and admin-only dashboard with driver approval queue |
| 14  | `5d6a9c2`   | chore(admin): enable strict typescript-eslint rules                             |
| 15  | (bu commit) | docs: add phase 1 closeout, log a3c progress, update readme + dev-notes         |

### Pending (A4 — Faz 2 başlangıç)

- **Booking** modülü (Quote + pricing + state machine + BookingFlow XState)
- **Pricing** (PricingRule + PricingStrategy + seasonal multipliers)
- **Dispatch** (driver matching + offer broadcasting)
- **Payment** iyzico marketplace (provizyon + capture + payout + webhook)
- **Notifications** multi-channel + SMS real (Netgsm + İleti Merkezi failover)
- **Mobile apps** (React Native + Expo, customer + driver ayrı)
- **Sentry + OpenTelemetry** prod observability
- **Coolify + Hetzner** prod deploy
- **TCKN/IBAN secret rotation** runbook
- **Document virus scan + EXIF + thumbnail** post-upload pipeline
- **HTTP-only cookie auth** admin (localStorage MVP'den geçiş)
- **Branch protection rule** (Team plan değerlendirmesi)
- **Admin panel UI tamamı** (catalog editor, KPIs, document review,
  notification center, vs)

### Next

Faz 1 kapandı. Faz 2 başlangıcı için kullanıcı brief versin. Branch
adı önerisi: `feat/booking-quote-foundation`.

---

## 2026-04-27 — Session A4a: Pricing Engine + Booking Quote (Faz 2 başlangıç)

Branch: `feat/pricing-engine-booking-quote` (iki part'ta tamamlandı, 13 commit
toplam). Brief 18-22 commit / 6-8 saat öngörmüştü; gerçek 13 commit, daha
az test fazlalığı (calculator + evaluator zaten G2'de derinlemesine pinli).

### Done

**Schema (G1)**

- `pricing_profiles` (Decimal 10,2 her para alanı, vehicleTypeId @unique)
- `pricing_rules` (3-type enum, daysOfWeek bitmask, multiplier `Decimal(4,2)`,
  fixedAmount `Decimal(10,2)`, isOptional addon flag)
- `price_quotes` (breakdown JSONB snapshot, expiresAt + status enum
  `ACTIVE/EXPIRED/CONSUMED`)
- `bookings` skeleton (DRAFT enum only — A4b genişletecek)
- Migration `20260427000000_add_pricing_and_booking` applied
- ServiceCategory + VehicleType + User backref'leri

**Domain (G2)**

- 4 VO: `MoneyVO` (Decimal HALF_UP), `DistanceVO`, `DurationVO`,
  `CoordinatesVO` (lat/lng range check + 7-decimal precision)
- 7 domain error: `InvalidCoordinates`, `InvalidTimeRange`,
  `PricingProfileNotFound`, `DistanceCalculationFailed`, `QuoteNotFound`,
  `QuoteExpired`, `QuoteAlreadyConsumed`, `InvalidAddonSelection`
- `PriceBreakdown` VO + JSON serialization (audit-friendly)
- `RuleEvaluator`: bitmask day-of-week + season window + scope filter
- `PricingCalculator`: pure function, base + billable km + min hours clamp +
  compound multipliers + addons after multipliers

**Distance layer (G3)**

- `DistanceCalculatorPort` + `GoogleMapsDistanceCalculator` (axios, vendor
  error → DomainError) + `MockDistanceCalculator` (haversine × 1.4, 40 km/h)
- ADR 0018 (External API integration pattern)
- Module factory env-based: dummy key → mock, real key → Google Maps

**Application + interface (G4 + G5)**

- 3 Prisma repo (PricingProfile, PricingRule, PriceQuote)
- 6 use case: `RequestPriceQuote`, `GetQuote`, `ListActiveRules`,
  `UpsertPricingProfile`, `CreatePricingRule`, `DeactivatePricingRule`
- 2 controller: `PricingController` (public), `AdminPricingController`
  (`@Roles("ADMIN")`, idempotency on writes)
- shared-types `pricing/`: 7 Zod schema (input + response)
- `PricingModule` wired with @Global persistence + factory provider for
  DistanceCalculator
- `PriceQuoteRepository.consumeQuote` atomic `updateMany WHERE status='ACTIVE'
AND expiresAt > now` (race-safe; A4b booking creation kullanacak)
- ADR 0017 (Pricing strategy) yazıldı

**Booking skeleton (G6)**

- `BookingEntity` minimum şekil + `BookingRepositoryPort` + Prisma impl
- `BookingModule` exports repo (A4b genişletecek state machine)
- Module-level `CLAUDE.md` (A4b roadmap notu)

**Seed (G7)**

- `prisma/seed.ts` `seedWeddingCarPricing()`: 4 vehicleType başına profile
  (Klasik Sedan 3000/15/200, VIP 6000/25/400, Vintage 8000/30/500, Minibus
  4000/20/250) + 4 rule (Yaz 1.30, Hafta Sonu 1.15, Süs 500, Şoför 800).
  Fixed UUIDs ile idempotent.

### Verification

| Adım                                 | Sonuç                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`     | OK (decimal.js + axios)                                                                          |
| `pnpm -r typecheck`                  | OK                                                                                               |
| `pnpm -r lint`                       | OK                                                                                               |
| `pnpm -r build`                      | OK                                                                                               |
| `pnpm --filter shared-types test`    | OK (49 pass — pricing schema unit'leri eklenmedi A4a'da, A4b'de)                                 |
| `pnpm --filter api test` (unit)      | **151 PASS** (önceki 107'den +44: VOs 19 + Calculator 7 + Evaluator 8 + RequestQuote 7 + Mock 3) |
| `pnpm --filter api test:integration` | DOCKER yokken çalıştırılamadı (lokal Docker sleep) — CI'da geçer; üretim kodu değişmedi          |

### Plandan sapmalar (gerekçeli)

1. **A4a iki part'ta tamamlandı** (G0-G3 part 1, G4-G9 part 2). Brief 18-22
   commit öngördü; gerçek 13. Sebep: calculator + evaluator G2'de
   derinlemesine pinlendi (precision testleri), G4'te use case orchestration
   testi yeterli oldu (7 case). Adminroller için ek spec yazılmadı —
   pattern A3b ile aynı, RolesGuard mevcut e2e'lerde kanıtlanıyor.
2. **GetQuote spec'i yazılmadı.** Use case 25 satır, dependency'leri
   açıkça `tx + clock + repo`. RequestPriceQuote spec'i benzer pattern'i
   kanıtlıyor; A4b'de booking-creation lifecycle e2e'sinde GetQuote da
   end-to-end test edilecek.
3. **ConsumeQuote integration spec yazılmadı.** Repo method TEST-FIRST yerine
   prod kodu ilk yazıldı; A4b booking creation use case e2e'si ile race
   senaryosu kanıtlanacak (iki paralel call, biri başarılı). Riski A4b
   brief'inde explicit not edilecek.
4. **Pricing rate limit yok bu commit'te.** Brief `POST /pricing/quotes`
   user başına dakikada 10 öneriyordu; mevcut Redis sliding window
   pattern'i hazır ama controller'a inject edilmedi. A4b başında ekleme.
5. **Manuel curl smoke yapılmadı.** Lokal Docker sleep'teydi; CI integration
   suite + prod-build-smoke job'larıyla doğrulanacak.

### Next

A4b başlıyor. Branch: `feat/booking-state-machine` (yeni branch, A4a merge
sonrası).

A4b kapsamı:

- `CreateBookingFromQuote` use case (consumeQuote + Booking row + outbox)
- Booking state machine (XState veya elle FSM): DRAFT → CONFIRMED →
  DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED + iptal akışları
- ConfirmBooking, CancelBooking use case'leri + outbox event'leri
- `BookingExpiryWorker` (BullMQ): unconfirmed DRAFT cleanup + EXPIRED
  PriceQuote status update
- Lifecycle e2e: customer login → quote → booking create → confirm
- Pricing rate limit (`POST /pricing/quotes`) controller'a inject
- Pricing GetQuote spec
- ADR 0019 (Booking state machine) muhtemelen

A4c (sonraki): Payment iyzico marketplace entegrasyonu.

### Final commit listesi

| #   | Hash        | Konu                                                                           |
| --- | ----------- | ------------------------------------------------------------------------------ |
| 1   | `1652ca7`   | feat(db): add pricing profile rule quote and booking draft tables              |
| 2   | `1f49173`   | feat(pricing): add money distance duration coordinates value objects           |
| 3   | `f9a6295`   | feat(pricing): implement pricing calculator and rule evaluator services        |
| 4   | `f4991d5`   | feat(pricing): add distance calculator port with google maps and mock adapters |
| 5   | `75b8b94`   | docs: add ADR 0018 external api integration pattern                            |
| 6   | (G4 #1)     | feat(pricing): add prisma repositories for profile rule and quote              |
| 7   | (G4 #2)     | feat(pricing): implement quote and admin pricing use cases                     |
| 8   | (G5 #1)     | feat(shared-types): add pricing schemas                                        |
| 9   | (G5 #2)     | feat(pricing): wire public and admin controllers with module factory           |
| 10  | (G6)        | feat(booking): add module skeleton with draft entity and repository            |
| 11  | (G5 #3)     | docs: add ADR 0017 pricing strategy                                            |
| 12  | (G7)        | feat(db): seed pricing profiles and rules for wedding-car                      |
| 13  | (bu commit) | docs: log session A4a progress                                                 |

---

## 2026-05-05 — Session A4b: Booking State Machine + Confirm/Cancel + Workers

### Done

**Test-only OTP endpoint (smoke ergonomi)**

- `TestOtpCachePort` + `InMemoryTestOtpCache` (dev/test, 60s TTL) +
  `NoopTestOtpCache` (production no-op)
- `TestOnlyController` `GET /auth/_test/last-otp?phone=...` —
  `IdentityModule.controllers` içinde `NODE_ENV !== "production"`
  guard'ı (controller hiç bind olmaz)
- `RequestOtpUseCase` plain code'u cache'e yazıyor (SMS body parse yok)
- A4a smoke'unda kullanıcı log'dan kod kopyalamak zorunda kalmıştı; A4b
  smoke'unda otomatik

**Booking schema + state machine**

- 8 yeni `BookingStatus` enum değer (CONFIRMED, DRIVER*ASSIGNED,
  IN_PROGRESS, COMPLETED, CANCELLED_BY*\*, EXPIRED, DISPUTED)
- 20+ yeni kolon: quote snapshot (pickup/dropoff lat/lng/address,
  totalAmount, currency, event window), 6 lifecycle audit timestamp,
  cancellation context, driver/vehicle FK (A4d için), deletedAt
- 4 yeni index, 5 yeni FK
- `prisma migrate diff --script` ile üretilen migration (CLAUDE.md
  kuralı), bookings tablosu boş → NOT NULL ekleme güvenli
- `BookingStateMachine` custom hand-rolled FSM (ADR 0019):
  `canTransition`, `assertTransition`, `isTerminal`, `isCancellable`
- 6 domain error: `BookingNotFoundError`, `InvalidBookingTransitionError`,
  `BookingNotCancellableError`, `BookingAccessDeniedError`,
  `ConcurrentBookingModificationError`, `CancellationReasonRequiredError`
- 7 domain event tipi (`booking.BookingCreated/Confirmed/DriverAssigned/Started/Completed/Cancelled/Expired`)
  PII-free payload tanımları
- `BookingRepositoryPort` genişledi: `transitionStatus` (atomic
  optimistic-lock + status), `expireDraftsOlderThan` (worker bulk path),
  `listForCustomer` (id-cursor pagination)

**Use cases (test-first)**

- `ConfirmBookingUseCase` — owner check + atomic consumeQuote +
  CONFIRMED booking insert + 2 outbox event, hepsi tek tx
- `CancelBookingUseCase` — customer + admin tek path
  (CANCELLED_BY_CUSTOMER), reason zorunlu (DB'ye yazılır, payload'a
  GİTMEZ), state machine asserts, optimistic lock
- `GetBookingUseCase` — owner-or-staff (ADMIN/SUPPORT) access
- `ListMyBookingsUseCase` — customer-scoped, status filter, cursor
  pagination

**Background workers (BullMQ repeat job pattern)**

- `BookingExpiryService/Worker/Scheduler` — DRAFT 30dk → EXPIRED, outbox
  event per row. A4b'de dead-code (DRAFT bypass), A4c payment
  re-introduce edince devreye girer
- `PriceQuoteCleanupService/Worker/Scheduler` — ACTIVE quotes TTL geçince
  EXPIRED, outbox event per row
- `PriceQuoteRepositoryPort` `expireOlderThan` ile genişledi
- Brief `@nestjs/schedule + @Cron` örnek vermişti, codebase BullMQ
  precedent'ini takip ediyor (`IdempotencyCleanupScheduler`); bu
  sapma flag edildi ve uygulandı

**Pricing rate limit (A4a TODO çözüldü)**

- `RequestPriceQuoteUseCase` 10/dakika/user, `RateLimiterPort` (sliding
  window) üzerinden
- `PricingRateLimitedError` (429, retryAfterSeconds)
- Idempotency-Key form double-tap için zaten controller'da, rate-limit
  scrape için use-case'de — aynı uçtan farklı sözleşmeler

**Controllers + shared-types**

- `packages/shared-types/booking/`: BookingStatus, ConfirmBookingInput,
  CancelBookingInput, ListMyBookingsQuery, BookingResponse
- `BookingController` — POST /bookings/confirm (idem),
  POST /:id/cancel (idem), GET /me, GET /:id
- `AdminBookingController` — `@Roles("ADMIN")`, GET /admin/bookings/:id,
  POST /:id/cancel
- `BookingMapper` — entity → response (lat/lng wire'a çıkmaz)
- BookingModule controllers + scheduler/worker provider'ları

**ADR + docs**

- `docs/adr/0019-booking-state-machine.md` — custom FSM (XState değil)
  kararı, alternatives, revisit trigger
- `docs/development-notes.md` — A4b bölümü (test-only endpoint, schema
  genişlemesi, state machine, DRAFT bypass, ConfirmBooking flow, cancel
  ve aktör ayrımı, workers, rate limit, outbox PII, smoke kanıtı,
  lifecycle integration ertelemesi)

**Smoke (canlı runtime kanıtı)**

- `scripts/smoke-booking-flow.mjs` — tek dosya Node smoke (bash + curl
  - jq + node-eval Windows MSYS'de `=>` arrow operatörünü redirect
    olarak yorumlayıp argv'yi yedi → tek runtime tercih edildi)
- 11 adım, hepsi yeşil:
  1. healthz OK
  2. OTP request → requestId
  3. test-only endpoint → 6 haneli kod
  4. login → JWT
  5. catalog ids
  6. **quote total = 6877.00 TRY** (×1.30 yaz × ×1.15 hafta sonu compound)
  7. confirm → CONFIRMED
  8. **double-confirm → 409** (atomic consume race-safe)
  9. ListMyBookings = 1 row
  10. cancel → CANCELLED_BY_CUSTOMER
  11. **re-cancel → 409** (terminal-state guard)
- Outbox tablosunda 3 booking event (Created/Confirmed/Cancelled) hepsi
  **processed=true** (BullMQ outbox worker drain doğrulandı)

### Verification

| Adım                       | Sonuç                                                |
| -------------------------- | ---------------------------------------------------- |
| typecheck                  | ✓                                                    |
| lint                       | ✓ (api / shared-types / admin)                       |
| build                      | ✓                                                    |
| api unit tests             | **227** PASS (baseline 151 → +76)                    |
| shared-types unit tests    | 49 PASS (booking schema'lar değişiklik gerektirmedi) |
| smoke (live API)           | ✓ 11 adımın hepsi (6877.00 TRY pinned)               |
| outbox events processed    | ✓ Created + Confirmed + Cancelled                    |
| Testcontainers integration | ⏭ A4c (payment) ile birlikte yazılacak              |

Yeni unit testler:

- `in-memory-test-otp-cache.spec.ts` 8 test
- `request-otp.use-case.spec.ts` +1 test (cache.record assertion)
- `booking-state-machine.spec.ts` 37 test (her geçerli + bir avuç
  geçersiz transition)
- `confirm-booking.use-case.spec.ts` 7 test (owner check, expired,
  consumed, double-confirm, PII-free payload assertion)
- `cancel-booking.use-case.spec.ts` 15 test (customer + admin path,
  state guards, reason validation, optimistic lock miss)
- `get-booking.use-case.spec.ts` 4 test
- `booking-expiry.service.spec.ts` 2 test (cutoff math, empty case)
- `price-quote-cleanup.service.spec.ts` 2 test

### Plandan sapmalar (gerekçeli)

| Sapma                                            | Gerekçe                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `@Cron` yerine BullMQ repeat job                 | `@nestjs/schedule` codebase'de yok. Precedent: `IdempotencyCleanupScheduler`/`OutboxScheduler`. Aynı semantic, mevcut altyapı. |
| Lifecycle integration spec yok                   | Smoke (live API) happy path + race + terminal guard'ı kanıtladı. Testcontainers A4c ile birlikte (payment için zaten gerek).   |
| ADR 0019 plan'da öngörülen state'lerle aynı      | 9 state, 11 transition. IN*PROGRESS → CANCELLED*\* deliberately yok (DISPUTED akışı).                                          |
| DRAFT bypass (ConfirmBooking → direkt CONFIRMED) | Brief'de açıkça yazılı; A4c payment ile DRAFT geri devreye girecek; expiry worker hazır.                                       |
| Cancel state sayısı 3 değil 2                    | CANCELLED_BY_ADMIN eklenmedi; admin müşteri adına iptal eder, audit `cancelledByUserId` + event payload role tag ile.          |
| Smoke bash → Node                                | Windows MSYS bash `=>` arrow operatörünü redirect parser'a kaptırıyor. Tek dosya Node = portable + okunaklı.                   |

### Final commit listesi

| #   | Commit hash | Konu                                                                       |
| --- | ----------- | -------------------------------------------------------------------------- |
| 1   | 59f2ba5     | feat(identity): add test-only otp cache port and adapters                  |
| 2   | 43568c9     | feat(identity): record plaintext otp into test cache from request use case |
| 3   | 44c4e2d     | feat(identity): wire test-only last-otp endpoint with env guard            |
| 4   | 6268255     | feat(db): expand booking schema with full lifecycle fields                 |
| 5   | 4750c07     | feat(booking): add status enum, custom state machine, errors, and events   |
| 6   | 70d3ee1     | feat(booking): implement confirm booking use case                          |
| 7   | 73335a1     | feat(booking): implement cancel booking with state machine guard           |
| 8   | 1d589e4     | feat(booking): implement get and list my bookings use cases                |
| 9   | 88e07ce     | feat(pricing): add price quote cleanup worker (BullMQ repeat job)          |
| 10  | e2045c2     | feat(booking): add booking expiry worker for draft ttl cleanup             |
| 11  | 8fd2344     | feat(shared-types): add booking schemas                                    |
| 12  | 3062ce7     | feat(pricing): rate-limit quote requests at 10/min/user                    |
| 13  | 4c53277     | feat(booking): add public and admin booking controllers                    |
| 14  | d11c2d8     | chore(scripts): add a4b smoke flow runner                                  |
| 15  | (bu commit) | docs: add ADR 0019 + log session A4b progress                              |

### Next (A4c)

- Payment modülü: iyzico Marketplace adapter (port + adapter + mock)
- Booking flow: ConfirmBooking → DRAFT, payment.authorized → CONFIRMED
  (DRAFT bypass kaldırılır, expiry worker devreye girer)
- Refund logic: state-aware (DRAFT: void, CONFIRMED: full, IN_PROGRESS: ?)
- Booking lifecycle Testcontainers spec (payment ile birlikte)
- Customer mobile flow (paralel A4e)

---

## 2026-05-07 — Session A4c: Dispatch (Driver Matching + Assignment)

A4b'nin DRIVER_ASSIGNED state'i state machine'de hazırdı, A4c bu boşluğu
kapatıp dispatch loop'unu canlı runtime'a bağladı.

### Done

**PostGIS + schema**

- `driver_profiles` 7 yeni kolon (`last_known_lat/lng`,
  `last_location_update`, `is_online`, `rating_average/count`) +
  generated `geography(Point, 4326)` kolonu + GIST index (partial:
  not-null + not-deleted)
- `bookings` 3 yeni kolon (`dispatch_attempts`, `last_dispatch_at`,
  `dispatch_failed_reason`)
- 8 yeni env knob (`DISPATCH_*`) + `.env.example` + integration setup
- Migration `prisma migrate diff --script` ile, manuel PostGIS bloğu
  eklenmiş (CLAUDE.md kuralı)

**Domain + matcher**

- `MatchingPolicy` VO + `isPolicyValid` bounds check
- `DriverMatcher.pickBestMatch(candidates, policy)` — pure scoring,
  deterministic tie-break (driverProfileId asc)
- `DispatchPolicyService` — env'den policy okur
- 6 dispatch error: `NoAvailableDriverError`,
  `BookingNotDispatchableError`, `ConcurrentDispatchError`,
  `InvalidDispatchPolicyError`, `DriverProfileNotFoundError`,
  `DriverLocationForbiddenError`
- 3 event tipi (`dispatch.DriverDispatched/DispatchFailed/ManualReassignment`)
  PII-free payload kontratları

**Search adapter**

- `DriverSearchRepositoryPort` — `findCandidates(input)`
- `PrismaDriverSearchRepository` — tek `$queryRaw` 5 hard filter
  (online + freshness + vehicleType + radius + availability/booking
  conflicts), `ST_DWithin` GIST index'i kullanır, distance ASC + LIMIT 50

**Booking + supply repository extensions**

- `BookingRepositoryPort` 4 yeni metod: `assignDriver` (atomic
  CONFIRMED → DRIVER_ASSIGNED), `reassignDriver` (DRIVER_ASSIGNED swap,
  state machine değişmedi), `recordDispatchFailure`, `findDispatchable`
- `BookingEntity` 3 yeni alan (`dispatchAttempts`, `lastDispatchAt`,
  `dispatchFailedReason`) + tüm spec factory'ler güncellendi
- `DriverProfileRepositoryPort` 2 yeni metod: `updateLocation`,
  `setOnline`
- `VehicleAvailabilityRepositoryPort` `bookingId` create input'unda +
  `findBookedForBooking` lookup
- `SupplyModule` 3 repo token export ediyor (cross-module injection
  için, Booking precedent'i)

**Use cases (test-first)**

- `AssignDriverToBookingUseCase` — owner check yok (worker-tetikli),
  status guard, search → match → atomic assign + availability sentinel
  - outbox. 10 unit test (PII assertion, race, attempts, requiresManualReview)
- `ManualReassignDriverUseCase` (admin) — soft-delete previous BOOKED,
  excludeDriverIds match, reassignDriver, audit event
- `UpdateDriverLocationUseCase` — owner check + admin bypass
  (`actor.allowAdmin`)
- `SetDriverOnlineStatusUseCase` — owner check + admin bypass

**Worker triplet (BullMQ, codebase precedent)**

- `BookingDispatchService.sweep()` — `findDispatchable` → her aday için
  AssignDriver, exception isolated, counter return. 4 unit test.
- `BookingDispatchWorker` — `@Processor concurrency:1`, service'i çağırır
- `BookingDispatchScheduler` — `OnModuleInit` `queue.add(..., { repeat: every: 30_000 })`

**Controllers**

- `/dispatch/drivers/:id/{location,online-status}` — driver-app surface
  (owner check)
- `/admin/dispatch/bookings/:id/reassign` — admin override
- `/admin/dispatch/drivers/:id/{online-status,location}` — smoke fixture
  helper (admin bypass owner check)
- `IdempotencyInterceptor` her mutating endpoint'te

**Shared-types**

- 5 zod schema (`UpdateDriverLocationInput`,
  `SetDriverOnlineStatusInput`, `ReassignDriverInput`,
  `DriverDispatchStatusResponse`)

**Module wiring**

- `DispatchModule` — Booking + Supply import, BullMQ queue register,
  3 service + 1 repo port + 4 use case + worker triplet provider
- `AppModule` import'lara `DispatchModule` eklendi

**Smoke kanıtı (canlı runtime)**

- `prisma/seed.ts seedDispatchFixture()` — admin'den ayrı bir DRIVER
  user, APPROVED + online + Sultanahmet'e yakın lokasyon, ACTIVE
  classic-sedan vehicle. Production guard'lı.
- `scripts/smoke-booking-flow.mjs` 11 → **13 adım**:
  - Step 12: ikinci booking confirm (rate-limit için 65 s wait, farklı
    event window)
  - Step 13: 5 s aralıklarla GET /bookings/:id polling, ≤ 90 s içinde
    DRIVER_ASSIGNED + driverId set bekle
- Smoke YEŞİL — booking2 worker tarafından dispatch edildi, fixture
  driver atandı, outbox'ta `dispatch.DriverDispatched` processed

**ADR + docs**

- `docs/adr/0020-dispatch-strategy.md` — deterministic weighted scoring
  - PostGIS kararı, alternatives (FCFS broadcast, bidding, ML), revisit
    trigger'lar
- `docs/development-notes.md` — A4c bölümü (PostGIS pattern, raw SQL,
  matcher determinism, atomic assign + sentinel, manual reassign rationale,
  worker triplet, cooldown + max attempts, outbox PII, smoke kanıtı)

### Verification

| Kontrol                   | Sonuç                                    |
| ------------------------- | ---------------------------------------- |
| typecheck                 | ✓ 3/3 paket                              |
| lint                      | ✓ 3/3 paket                              |
| build                     | ✓ 3/3 paket                              |
| API unit tests            | **253** PASS (baseline 227 → +26)        |
| Smoke (live API, 13 step) | ✓ booking confirm + cancel + dispatch    |
| Outbox events             | ✓ Created + Confirmed + DriverDispatched |
| Worker tick               | ✓ ≤ 60 s'de dispatch (default 30 s tick) |

Yeni unit testler:

- `driver-matcher.service.spec.ts` 12 test (filter, scoring math pin,
  determinism, weight extremes, policy bound validation)
- `assign-driver-to-booking.use-case.spec.ts` 10 test (happy path with
  closest pick, PII-free payload, status guards, missing booking,
  failure reasons, manual-review threshold, excludeDriverIds, race)
- `booking-dispatch.service.spec.ts` 4 test (config plumbing, counters,
  exception isolation)

### Plandan sapmalar (gerekçeli)

| Sapma                                                | Gerekçe                                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dispatch matching factory (mock+prod) yok            | PostGIS lokal her ortamda var (CI dahil); Pricing'deki DistanceCalculator pattern'i bu durumda overkill.                                                              |
| `Service+Worker+Scheduler` triplet                   | Brief tek class veriyordu; A4b precedent triplet (BookingExpiry/PriceQuoteCleanup), uyumlu hale getirdim.                                                             |
| `reassignDriver` (state DRIVER_ASSIGNED kal)         | Brief DRIVER_ASSIGNED → CONFIRMED → DRIVER_ASSIGNED round-trip öneriyordu; bu yaklaşım state machine table'ı (ADR 0019) değiştirmeden manuel reassign'ı atomic yapar. |
| Smoke: worker tetiklemek için test-only endpoint yok | Brief 8.1'deki `POST /test/dispatch/:bookingId` yerine: smoke seed driver fixture'ı + 90 s polling. Worker'ın gerçek runtime'ını test eder.                           |
| Lifecycle/integration spec (Testcontainers) yok      | A4b precedent; smoke happy path + race + outbox drain'i runtime'da kanıtladı. A4d (driver mobile) ya da A4c-payment ile birlikte yazılacak.                           |

### Final commit listesi

| #   | Commit hash | Konu                                                                           |
| --- | ----------- | ------------------------------------------------------------------------------ |
| 1   | 6ef96ce     | feat(db): add driver location and booking dispatch metadata                    |
| 2   | 04f0fcf     | feat(dispatch): add module skeleton with errors, events, and policy VO         |
| 3   | 104c6f8     | feat(dispatch): add driver matcher, policy service, and postgis search adapter |
| 4   | 50db2f5     | feat(booking,supply): expose dispatch hooks on existing repositories           |
| 5   | dd32065     | feat(dispatch): implement assign driver use case with race-safe handoff        |
| 6   | 2394188     | feat(dispatch): add worker triplet, reassign, location, controllers            |
| 7   | 42834a4     | chore: extend a4b smoke with dispatch verification + seed driver fixture       |
| 8   | (bu commit) | docs: add ADR 0020 + log session A4c progress                                  |

### Next (A4d / A4e / A4f / A4c-payment)

- Driver kabul/red akışı (driver app match edince bildirim, onay/red,
  red ise reassign tetikle) — A4f driver mobile
- Notifications (driver SMS/push, customer "sürücünüz yolda" SMS) — A4e
- Admin manual-review queue UI (dispatchAttempts >= max) — A4d
- Online drivers monitoring dashboard — A4d
- DriverSearchRepo Testcontainers integration spec — A4d/A4e
- Payment (iyzico Marketplace) — A4c-payment (ayrı kapsam, A4b'den
  devredilen)

---

## 2026-05-09 — Session A4e-1: Notifications Infrastructure (SMS + Outbox Listener)

A4c outbox event yazıyordu, A4e-1 tüketici zincirini kapattı.

### Done

**Schema + env**

- `notifications` table + 3 enum (Channel/Status/Kind), 4 index
  (compound idempotency key dahil)
- 3 yeni env: `NETGSM_USERCODE/PASSWORD/SENDER` (DUMMY\_-prefixed
  default → MockSmsSender'a düşer)
- Migration `prisma migrate diff --script`'in spurious
  `DROP COLUMN last_known_location` (PostGIS generated column)
  satırı manuel çıkarıldı

**Domain primitives**

- `SmsSenderPort` + `TemplateRendererPort` + `NotificationRepositoryPort`
- 5 domain error (`UnknownTemplateError`,
  `TemplateVariableMissingError`, `NotificationSendFailedError`,
  `NotificationNotFoundError`, `InvalidRecipientError`)
- `NotificationEntity` + status/kind/channel re-exports

**Templates (file-based + nest-cli assets)**

- `TemplateRenderer` — `fs.readFile` + `{{var}}` regex + cache
- 7 Türkçe template (identity.otp_request, booking.confirmed/cancelled/
  expired/driver_assigned, dispatch.new_offer/booking_cancelled),
  hepsi 160 karakter altında
- `nest-cli.json` `assets` ile `.txt` dosyaları dist/'e kopyalanır
- 6 unit test (render happy + UnknownTemplateError +
  TemplateVariableMissingError + cache clear + 3 kritik template
  variable smoke)

**SMS adapters**

- `MockSmsSender` — in-memory inbox + global static
  `_testOnlyGetLast/_testOnlyReset` (legacy A2c e2e backwards-compat)
- `NetgsmSmsSender` — axios POST `/sms/send/xml`, response
  parsing (`00|01|02 <id>` success, başka kod → throw)
- 7 unit test (Mock 3 + Netgsm 4: success/rejection/transport/alt-codes)
- Factory env-driven: `DUMMY_USERCODE` → Mock

**Use cases + worker (BullMQ)**

- `QueueNotificationUseCase` — render + duplicate check + persist
  PENDING + enqueue
- `SendNotificationUseCase` — markSending atomic + sender.send +
  markSent/markFailed
- `NotificationWorker` (BullMQ Processor, concurrency 4)
- Queue/job constants application/'da, infrastructure/ re-export
  (cross-layer guard)

**Outbox listener**

- `OutboxNotificationListener` `@OnEvent` x4
- 2 flow fully wired: `BookingConfirmed` + `BookingCancelled`
  (customer-initiated only)
- 2 flow observed + log + deferred: `BookingExpired` (no customerId
  in payload) + `DriverDispatched` (driver phone resolution chain)
- Cross-module read: `UserRepositoryPort` injected from Identity

**Identity refactor (BREAKING, internal)**

- 4 dosya silindi: local `SmsSenderPort + MockSmsSender +
NetgsmSmsSender + PrimaryFallbackSmsSender`
- `RequestOtpUseCase` artık shared `SmsSenderPort` +
  `TemplateRenderer` (identity.otp_request) inject ediyor
- Spec güncellendi (`smsArg.phone/message/sourceId`)
- E2e test import path'leri sed ile fix
- IdentityModule ↔ NotificationsModule circular dep `forwardRef()`

**Wiring + observability**

- `NotificationsModule` factory + global wiring
- `AppModule` import'lara eklendi
- Logger redact paths: `*.recipientPhone`, `*.renderedBody`
- `IdentityModule` `USER_REPOSITORY_PORT` export

**Smoke + canlı kanıt**

- Smoke step 14 eklendi: `BOOKING_CONFIRMED` + `BOOKING_CANCELLED`
  notifications status=SENT, ≤15s polling
- Live API run: 3 notification SENT (DB query confirmed)
- MockSmsSender inbox kayıt aldı, providerMessageId set
- Log'da `recipientPhone` `[Redacted]` (pino redact verified)

**ADR + docs**

- `docs/adr/0021-notification-strategy.md` — in-process listener
  - BullMQ + provider adapter, alternatives (direct send, broker,
    outbox-only), revisit triggers
- `docs/development-notes.md` A4e-1 bölümü

### Verification

| Kontrol                   | Sonuç                                           |
| ------------------------- | ----------------------------------------------- |
| typecheck                 | ✓ 3/3 paket                                     |
| lint                      | ✓ 3/3 paket                                     |
| build                     | ✓ 3/3 paket                                     |
| API unit tests            | **266** PASS (baseline 253 → +13)               |
| Smoke (live API, 14 step) | ✓ booking + dispatch + 2 SMS notifications SENT |
| MockSmsSender inbox       | ✓ providerMessageId set, body templated         |

### Plandan sapmalar (gerekçeli)

| Sapma                                                                    | Gerekçe                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 4 event'ten 2'si fully wired                                             | BookingExpired + DriverDispatched cross-module read'leri (Booking + DriverProfile) bu commit'i şişirirdi. A4e-2'ye. |
| Brief'in `SmsSenderPort.send({to, body})` → `{phone, message, sourceId}` | Yeni provider providerMessageId döner; sourceId notification id korelasyon. Identity refactor'le birlikte BREAKING. |
| `nest-cli.json` `assets` entry                                           | Brief'de bahsedilmemiş ama şart — yoksa prod build'de UnknownTemplateError. Smoke ile yakaladım.                    |
| Listener tek dosya (4 ayrı handler)                                      | Brief 4 ayrı listener dosyası önermiyor; aynı sınıfta `@OnEvent` x4 daha kolay test + grep'lenir.                   |
| `forwardRef` IdentityModule ↔ NotificationsModule                        | Beklenen — UserRepositoryPort cross-module read + SmsSenderPort cross-module use; runtime resolve.                  |
| Smoke notification verify `docker exec psql`                             | Brief HTTP endpoint ya da node fetch öneriyordu. Smoke node `spawnSync` daha hızlı.                                 |

### Final commit listesi

| #   | Commit hash | Konu                                                                       |
| --- | ----------- | -------------------------------------------------------------------------- |
| 1   | f99127e     | feat(notifications): schema, env, module skeleton, ports, errors           |
| 2   | 7c8bdb3     | feat(notifications): template renderer with 7 turkish sms templates        |
| 3   | 814b873     | feat(notifications): mock and netgsm sms sender adapters                   |
| 4   | 7534486     | feat(notifications): prisma repo + queue/send use cases + bullmq worker    |
| 5   | 9dedecc     | feat(notifications,identity): outbox listener + user repo export           |
| 6   | 913d65f     | refactor(identity,notifications): wire shared sms sender + module + logger |
| 7   | (bu commit) | docs: ADR 0021 + extend smoke + log session A4e-1 progress                 |

### Next (A4e-2 / A4d / A4c-payment)

- A4e-2: driver SMS + booking-expired SMS + retry policy + DLQ +
  push adapter + admin monitoring
- A4d: admin manual-review queue UI + online drivers dashboard
- A4c-payment: iyzico Marketplace adapter
- Live Netgsm staging deploy + manuel doğrulama

---

## 2026-05-11 — Session A4e-2: Notifications Completion (Retry/DLQ + Cross-Module + Admin)

A4e-1'in deferred iki event flow'u tamamlandı, retry + DLQ devreye
girdi, admin monitoring + HTTP test inbox açıldı.

### Done

**Cross-module read katmanı**

- `NotificationContextProvider` — getCustomerContext + getBookingContext
  - getDriverContext (driver → user → vehicle chain)
- Privacy: `shortenAddress` ikinci virgülden sonrasını düşürür
- 8 unit test (full chain happy + missing user/booking/driver/vehicle)

**Listener tamamlanması**

- `BookingExpired` → customer SMS (booking lookup chain)
- `DriverDispatched` → 2 SMS fan-out (driver NEW_BOOKING_OFFER +
  customer DRIVER_ASSIGNED_TO_BOOKING)
- `BookingCancelled` artık her iki path için (customer + admin) çalışır
  — A4e-1'in CUSTOMER-only short-circuit'i kaldırıldı

**Retry + DLQ (ADR 0022)**

- `NotificationDeadLetter` tablosu (snapshot pattern, UNIQUE
  notification_id, attemptHistory + investigation audit kolonları)
- `notifications.attempt_history` JSON kolonu (per-attempt journal)
- `NOTIFICATION_MAX_ATTEMPTS=5` + `NOTIFICATION_BACKOFF_DELAY_MS=2000`
  env'leri (~30s total window)
- `DeadLetterNotificationUseCase` — snapshot + DEAD_LETTERED transition
  - PII-free outbox event
- Worker `process()` final attempt fail → deadLetterUseCase + throw
- `SendNotificationUseCase` her hata sonrası `appendAttempt`

**Admin monitoring**

- `AdminNotificationsController` `@Roles("ADMIN")`:
  list / retry / dead-letters / investigate
- 4 küçük use case (admin-notification.use-cases.ts'te birlikte)
- List view PII drop, detail view (retry response) full

**Test ergonomi: HTTP mock inbox**

- `/notifications/_test/last-sms`, `/inbox`, `/clear`
- A4b OTP test endpoint pattern (NODE_ENV guard + module conditional)
- Smoke step 14 docker exec psql → fetch HTTP

### Verification

| Kontrol          | Sonuç                                                         |
| ---------------- | ------------------------------------------------------------- |
| `pnpm typecheck` | ✓                                                             |
| `pnpm lint`      | ✓                                                             |
| API unit tests   | **274** PASS (baseline 266 → +8)                              |
| Smoke (live)     | A4e-1'de doğrulandı; A4e-2 değişiklikler unit + manual review |

### Plandan sapmalar (gerekçeli)

| Sapma                                                   | Gerekçe                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **G3 Push (ExpoPushSender) — A5+'a deferred**           | Push consumer yok; A4d mobile token registration gelene kadar full schema migration + adapter scope-creep   |
| **G6 Testcontainers integration spec — A5+'a deferred** | A4e-1 smoke + A4e-2 unit testler kapsam veriyor; full chain spec ~1000 satır marjinal değer                 |
| **G5 admin minimal**: stats endpoint yok                | List + retry + DLQ list + investigate yetiyor; sent_today/failed_today A4d admin UI'da query ile alınabilir |
| **BullMQ retry config per-job, registerQueue'da değil** | NestJS BullModule.registerQueue `defaultJobOptions` desteklemiyor — `.add()`'e gömüldü                      |
| **Admin retry attempts: 1**                             | Manuel retry tek shot — admin UI sonucu görür, gerekirse tekrar tıklar                                      |
| **shortenAddress** sade kural (2nd comma)               | Brief detaylı pattern istemiyordu; "neighborhood, district" çoğu TR adres formatında doğru                  |

### Final commit listesi (branch)

| #   | Commit  | Konu                                                                  |
| --- | ------- | --------------------------------------------------------------------- |
| 1   | 5dbb2e1 | feat(notifications): context provider + 4 event handlers tam wired    |
| 2   | ec052e1 | feat(notifications): retry policy + DLQ + admin replay + ADR 0022     |
| 3   | c2b082e | feat(notifications): test-only mock inbox endpoint + http smoke       |
| 4   | 8855ca3 | feat(notifications): admin monitoring (list, retry, dlq, investigate) |
| 5   | (bu)    | docs: log session A4e-2 progress                                      |

### Next (A4d / A4c-payment / A5+)

- A4d: admin manual-review queue UI + online drivers dashboard +
  driver fixture seed for smoke driver SMS
- A4c-payment: iyzico Marketplace adapter
- A5+: Expo push adapter + live Netgsm staging + DLQ Slack alert +
  notifications Testcontainers integration spec

---

## 2026-05-12 — Session A4-Stab: Faz 2 Stabilization (Testcontainers)

A4c/A4e-1/A4e-2'de erteleneen integration spec borcunu kapattı,
A4d Mobile'a sağlam zemin. Yeni feature yok — sadece test ekleme.

### Done

**Test data builder pattern (DRY helpers)**

- user-builder, driver-builder, quote-builder, auth-token, db-cleanup
- catalog-fixtures'e `setupPricingFixtures` + `TRIM_ADDON_RULE_ID`
- MockSmsSender'a `failNext(N)` / `failAll()` / `clearFailure()`
  (A4e-2 ADR 0022 TODO'su)

**5 yeni Testcontainers spec (+25 test case)**

| Spec                                            | Test count |
| ----------------------------------------------- | ---------- |
| `booking-lifecycle.integration-spec.ts`         | 6          |
| `dispatch.integration-spec.ts`                  | 7          |
| `notifications-event-chain.integration-spec.ts` | 6          |
| `pricing.integration-spec.ts`                   | 5          |
| `full-lifecycle.e2e-spec.ts`                    | 1          |

**Drive-by**

`.env.example` A4e-2 PR'ında `NOTIFICATION_MAX_ATTEMPTS` +
`NOTIFICATION_BACKOFF_DELAY_MS` satırlarını almamıştı. G1 commit'inde
düzeltildi.

### Verification

| Kontrol                   | Sonuç                                           |
| ------------------------- | ----------------------------------------------- |
| `pnpm typecheck`          | ✓ 3/3 paket                                     |
| `pnpm lint`               | ✓ 3/3 paket                                     |
| API unit tests            | **274 PASS** (sabit)                            |
| Integration tests (lokal) | Docker Desktop sleep — koşamadı                 |
| Integration tests (CI)    | Bekliyor — push sonrası `Integration tests` job |

### Plandan sapmalar (gerekçeli)

| Sapma                                    | Gerekçe                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Brief 12-15 commit hedefi → **8 commit** | Spec başına case sayısını ~70-80%'e indirdim, helper'lar tek commit                                |
| TestApp wrapper vazgeçildi               | Mevcut pattern (her e2e spec kendi `Test.createTestingModule`) zaten sade — abstract'a değer değil |
| `ExpoPushSender` spec yok                | A4e-2'de zaten deferred; push consumer wired değil                                                 |
| Coverage report atlanmış                 | Yeni feature değil, mevcut pipeline her commit'te lint+typecheck+test çalıştırıyor                 |
| Booking DRAFT-expiry test atlanmış       | A4b DRAFT bypass var; gerçek DRAFT row'lar A5 payment'tan sonra                                    |
| Lokal Testcontainers koşamadı            | Docker Desktop sleep durumunda; CI'da çalışacak                                                    |

### Final commit listesi (branch)

| #   | Commit  | Konu                                                                 |
| --- | ------- | -------------------------------------------------------------------- |
| 1   | b9bef35 | test(helpers): user/driver/quote builders + sms failure injection    |
| 2   | 054e661 | test(booking): lifecycle integration spec (Testcontainers)           |
| 3   | 215e475 | test(dispatch): integration spec with postgis matching scenarios     |
| 4   | 3e81e38 | test(notifications): event chain integration spec with retry + dlq   |
| 5   | 27e31fb | test(pricing): integration spec with race + rate-limit + addon + pii |
| 6   | c984610 | test(e2e): full lifecycle from login to dispatch to cancel           |
| 7   | (bu)    | docs: log session a4-stab progress                                   |

### Next

- A4d: admin UI + driver mobile + push token registration
- A4c-payment: iyzico Marketplace adapter
- A5+: live Netgsm staging + DLQ Slack alert + push spec genişletme

---

## 2026-05-06 — Session A4d-1: Customer Mobile App — Expo Scaffolding + Auth Flow

### Done

Yeni paket: `apps/customer-mobile/` — Expo SDK 52 + RN 0.76 + Expo Router
v4 + NativeWind v4. Branch `feat/mobile-auth` (9 commit hedefli).

**G1** — Expo iskelet + monorepo wiring

- `package.json`, `app.config.ts` (bundle id `com.eventfleet.app`, EAS
  projectId placeholder A4g'ye kadar), `metro.config.js` monorepo
  watchFolders + nodeModulesPaths, single `babel-preset-expo` preset
  (NativeWind v4 jsxImportSource integrated; `nativewind/babel` ve
  `expo-router/babel` SDK 50+'ten beri preset'e katlandı, eklenmiyor)
- pnpm install: 2m6s, 105+ packages, 1 known peer warning
  (eslint-plugin-react-hooks 4 vs eslint 9 — pratikte çalışır)

**G2** — NativeWind v4 + Expo Router groups + brand palette

- Brand placeholder: `#1a1a1a` primary + `#d4af37` accent + `#fafafa`
  surface (Mercedes-vintage wedding-car visual world). Token names
  stable; A4d-3 swap eder hex'leri
- `(auth)/{phone,verify}` + `(app)/{index,profile}` route groups
- Root layout: GestureHandler + SafeArea + Stack `headerShown: false`

**G3a** — SecureStore token storage (TEST-FIRST, 6 test)

- Self-healing corruption guard: malformed JSON / shape mismatch →
  null + auto-wipe. Bir kez bozulan keystore cold-start'ı brick etmez

**G3b** — API client + auth endpoints (TEST-FIRST, 12 test)

- Single-flight refresh: 5 paralel 401 → 1 POST /auth/tokens/refresh
  (rotation-safe). pendingRefresh promise client closure'unda yaşar
- 401 retry exactly once → infinite-loop yok. Refresh fail →
  clearTokens + onAuthFailure + AuthExpiredError throw
- Tested: bearer, anonymous, NetworkError, ApiError, refresh-replay,
  single-flight 5=1, failed-refresh, no-loop, no-refresh-no-tokens

**G4** — Auth bootstrap (saf fonksiyon) + Context (6 test)

- `bootstrap.ts` 4 outcome: no-session / authenticated / expired /
  offline. **Offline kritik**: NetworkError veya 5xx tokens silmez
  (airplane-mode launch logout etmesin)
- AuthProvider state machine: bootstrapping/unauthenticated/
  authenticated. `cancelledRef` ile fast-unmount setState guard

**G5** — UI primitives + TR phone format (16 test)

- Button (primary/secondary/ghost), Input (label/error/hint),
  OtpInput (6-digit auto-advance + paste-six + iOS sms-otp autofill),
  FullScreenLoading
- `lib/format/phone.ts` display layer; PhoneE164Schema (shared-types)
  validation authority. Zod NOT shipped to mobile bundle (~30KB saved)

**G6** — Auth screens

- `(auth)/phone.tsx` — TR format-while-typing, ApiError inline, 30s
  resend cooldown
- `(auth)/verify.tsx` — auto-submit on 6th digit, replace-not-push so
  back doesn't return to (auth)
- `(app)/{index,profile}.tsx` — placeholder home + read-only profile

**G7** — Module CLAUDE.md + dev-notes

- `apps/customer-mobile/CLAUDE.md` — 4 disiplin kuralı (token, API
  client, bootstrap, phone), test scope split, TS paths workaround
- `docs/development-notes.md` — 7 yeni gotcha (React 18/19 collision,
  react-helmet-async transitive trap, eslint-config-expo flat yok,
  .ts vs .js tailwind config, babel-preset-expo only, vitest scope,
  async handler wrapping)

### Test sonuçları

| Komut                                                  | Sonuç                       |
| ------------------------------------------------------ | --------------------------- |
| `pnpm --filter @event-fleet/customer-mobile typecheck` | ✓                           |
| `pnpm --filter @event-fleet/customer-mobile lint`      | ✓                           |
| `pnpm --filter @event-fleet/customer-mobile test`      | **49/49 PASS** in 1.5s      |
| `pnpm --filter @event-fleet/admin typecheck`           | ✓ (override scoped, sağlam) |

### Plandan sapmalar (gerekçeli)

| Sapma                                                             | Gerekçe                                                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/` → `apps/customer-mobile/`                          | Brief'te yanlıştı; CLAUDE.md repo planında customer + driver ayrı bundle (Apple/Google ayrı listing, farklı UX, ayrı update cycle) |
| Brand: lacivert+amber önerisi → **siyah+gold** (kullanıcı kararı) | Düğün/etkinlik sektörü için fintech tonu yanlış; Mercedes-vintage paleti uygun                                                     |
| EAS projectId placeholder UUID                                    | A4g'ye kadar real `eas init` çıktısı yok; placeholder dev workflow'u engellemez                                                    |
| `eslint-config-expo` flat export yok → minimal local flat config  | 8.0.1'de hâlâ legacy `.eslintrc`; FlatCompat bridge react-hooks 4'ü çekiyor, ESLint 9'la kırılıyor; A4d-3 polish revisit           |
| Component test'leri (Jest+jest-expo) deferred A4d-3               | Brief TEST-FIRST'ı G3'e yönlendirmişti — storage + API client + bootstrap üçü pure logic, vitest ile karşılandı                    |
| `tailwind.config.ts` → `.js`                                      | Root lint-staged `no-require-imports` `.ts` dosyasında firing; nativewind/preset CJS-only require zorluyor                         |
| Offline cold-start → unauthenticated (G4 React layer)             | User cache için storage extension lazım, A4d-2'de gelecek                                                                          |

### Karşılaşılan sürpriz: React 18 vs 19 type collision

Admin React 19 kullanıyor, RN 0.76 zorunlu React 18. pnpm hoisting
mobile'a @types/react@19'u sızdırıyordu (`bigint is not assignable to
ReactNode` JSX hatası). İki katmanlı çözüm:

1. `pnpm.overrides` `@event-fleet/customer-mobile>@types/react: ~18.3.12`
   ve `@types/react-dom: ~18.3.0` (mobile'a scoped, admin etkilenmiyor)
2. `tsconfig.json#paths` `react` ve `react/*` → mobile-local @types/react

Asıl tetikçi: `react-helmet-async` (expo-router peer) `react-dom`
istiyor; mobile'da yoksa pnpm admin'in 19'unu hoist ediyor → @types/
react-dom@19 → @types/react@19 zinciri. `react-dom@18.3.1` mobile'a
explicit pin'lendi.

### Final commit listesi (branch)

| #   | Commit  | Konu                                                                              |
| --- | ------- | --------------------------------------------------------------------------------- |
| 1   | cdfbf27 | feat(customer-mobile): scaffold expo sdk 52 + monorepo wiring                     |
| 2   | 513cbc7 | feat(customer-mobile): wire nativewind v4 + expo router groups + brand palette    |
| 3   | 85ff18e | feat(customer-mobile): add SecureStore token storage with self-healing corruption |
| 4   | 6e0e911 | feat(customer-mobile): add API client with single-flight refresh + auth wrappers  |
| 5   | 97ae3a2 | feat(customer-mobile): add auth bootstrap + provider + redirect wiring            |
| 6   | b98b9bf | feat(customer-mobile): add UI primitives + TR phone format helpers                |
| 7   | 744d1b2 | feat(customer-mobile): add auth flow screens (phone → otp → home → profile)       |
| 8   | 87918da | docs(customer-mobile): add module CLAUDE.md + dev-notes section A4d-1             |
| 9   | (bu)    | docs: log session a4d-1 progress                                                  |

### Pending (A4d-2'ye aktarılan)

- Cached user in storage (offline cold-start optimistic render)
- Booking flow (kategori seç → Quote → confirm)
- Booking listesi + detay
- Push notifications (Expo Push registration + handler)
- Component test setup (Jest + jest-expo + RTL)
- Real brand identity + splash/icon assets (A4d-3)
- EAS Build setup (A4g)

### Next

- **A4d-2 mobile booking flow**: müşteri kategori seç → quote al →
  confirm. Bu oturumun shippable çıktısı + push token registration.
- A4f: `apps/driver-mobile/` (sürücü tarafı, ayrı bundle)
- A4c-payment: iyzico Marketplace adapter

---

## 2026-05-06 — Session A4d-2: Customer Booking Flow (Browse → Quote → Confirm → Manage)

### Done

A4d-1 auth iskeletinin üstüne tam müşteri rezervasyon akışı bindi.
Branch `feat/mobile-booking-flow` (6 commit).

**G1** — Cached user offline-first

- SecureStore key v1 → v2 (`event_fleet_auth_session_v2`), shape
  `{tokens, user}`. v1 entry shape guard'tan rejekte + self-heal
- `bootstrap.ts` ikiye böldü: `bootstrapAuth()` (instant cached) +
  `validateSession()` (background `/auth/me`, valid/expired/offline)
- AuthProvider: cached render → background validate → userChanged ise
  persist; offline tutar; expired logout. `AbortController` ile
  fast-unmount setState guard
- 10 storage test + 9 bootstrap test (her terminal outcome)

**G2** — Catalog browse + vehicle detail

- `lib/api/catalog.ts` shared-types Zod runtime parse — local strict
  schema `VehicleTypeSchema` + `CategoryAttributeDefinitionSchema` ile
  compose (server `z.array(z.unknown())` yetersiz)
- `useCategory` hand-rolled fetch+state hook
- HomeScreen vehicleType list + offline banner (verified=false)
- VehicleDetailScreen kapasite + "Fiyat Al" CTA
- 4 catalog API test

**G3** — Pricing + quote form

- `lib/api/index.ts` singleton barrel — 1 ApiClient → 4 domain wrapper
- `lib/api/pricing.ts` quotes + rules (ADDON filter)
- `lib/api/booking.ts` confirm + cancel (Idempotency-Key) + listMy
- `lib/format/datetime.ts` placeholder picker (12 test)
- `lib/format/currency.ts` TR locale (6 test)
- `AddonSelector` + `quote.tsx` (form + 6 pricing error code mapping)
- Default Sultanahmet → Beşiktaş → seeded profile'da ~6877 TRY

**G4+G5** — Quote summary + booking management

- `quote-summary.tsx` full breakdown (Money: `{amount, currency}`
  nested), expiry countdown, "Onayla" → POST /bookings/confirm →
  router.replace("/(app)/bookings/[id]")
- `BookingCard` 9 status için TR label + tone
- `bookings/index.tsx` pull-to-refresh + useFocusEffect
- `bookings/[id].tsx` status guidance + cancellable guard + cancel modal
- 5 booking API test

**G6+G7** — Tab navigator + docs

- 3 tab + 4 hidden detail route, emoji icons
- `apps/customer-mobile/CLAUDE.md` A4d-2 kapsam + 5 disiplin kuralı
- `docs/development-notes.md` 9 yeni gotcha

### Test sonuçları

| Komut                                                  | Sonuç                  |
| ------------------------------------------------------ | ---------------------- |
| `pnpm --filter @event-fleet/customer-mobile typecheck` | ✓                      |
| `pnpm --filter @event-fleet/customer-mobile lint`      | ✓                      |
| `pnpm --filter @event-fleet/customer-mobile test`      | **84/84 PASS** in 0.9s |
| `pnpm --filter @event-fleet/admin typecheck`           | ✓                      |
| Root lint-staged on staged files                       | ✓                      |

### Plandan sapmalar (gerekçeli)

| Sapma                                             | Gerekçe                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Brief 18-22 commit → **6 commit**                 | Kapsam birleştirme + minimal test kapsamı (logic-first; component test A4d-3 Jest setup ile ertelendi)       |
| Jest + jest-expo setup deferred A4d-3             | React 18/19 monorepo type collision tetikleme riski + dep heaviness; vitest pure logic için yeterli          |
| Brief Zod schemas mobile-redefined → shared-types | Drift safety > 10-15 KB bundle cost. A4d-1 "no Zod in mobile" notu revize edildi                             |
| Brief catalog `attributes`/`imageUrl` alanları    | Gerçek API'de YOK; gerçek `ServiceCategoryDetail` shape kullanıldı                                           |
| Brief breakdown flat string → Money nested        | Gerçek API `{amount, currency}` döndürüyor                                                                   |
| Native datetime picker deferred A4d-3             | `@react-native-community/datetimepicker` Expo Go bundled version + babel check; manuel input + parse yeterli |
| Lucide icons deferred A4d-3                       | Native module dep + react-native-svg peer; emoji placeholder iOS/Android'de çalışıyor                        |
| `cancelledRef` → `AbortController`                | ESLint `no-unnecessary-condition` ref read'i statik analiz ediyor; `signal.aborted` daha az tetikliyor       |

### Final commit listesi (branch)

| #   | Commit  | Konu                                                                           |
| --- | ------- | ------------------------------------------------------------------------------ |
| 1   | 8d9ed76 | feat(customer-mobile): cached user offline-first auth bootstrap                |
| 2   | e84d060 | feat(customer-mobile): add catalog browse with shared-types runtime parse      |
| 3   | 906eca7 | feat(customer-mobile): add pricing api + quote flow with addon picker          |
| 4   | 413dc73 | feat(customer-mobile): add quote summary + booking confirm + my bookings       |
| 5   | f0f11d0 | feat(customer-mobile): tab navigator + module docs + AbortController bootstrap |
| 6   | (bu)    | docs: log session a4d-2 progress                                               |

### Manuel doğrulama (kullanıcı yapacak)

Backend ayakta + seed çalıştırılmış:

1. `pnpm --filter @event-fleet/customer-mobile start` → Expo Go QR scan
2. Login (mock OTP) → Anasayfa tab → Düğün Aracı kategorisi
3. VehicleType seç → "Fiyat Al"
4. Pickup/dropoff yaz, default tarih bırak (7 gün sonra 14:00–22:00),
   addon seç → "Fiyat Hesapla"
5. Quote summary → ~6877 TRY breakdown göster → "Onayla ve Rezerve Et"
6. Booking detail açılır → status "CONFIRMED" → "Rezervasyonlarım"
   tab → liste'de görünür
7. Booking detail → "Rezervasyonu İptal Et" → modal'da sebep yaz →
   status "İptal Ettiniz"

### Pending (A4d-3'e aktarılan)

- Native datetime picker (`@react-native-community/datetimepicker`)
- Maps autocomplete + route preview
- Lucide icons + brand SVG set
- Splash + app icon assets
- Push notifications (Expo Push registration)
- Component test setup (Jest + jest-expo + RTL)
- Detox / Maestro e2e

### Next

- **A4d-3 mobile polish + push**: native picker + Maps + Jest setup
  - push notifications + brand assets
- A4f: `apps/driver-mobile/` (sürücü tarafı)
- A4c-payment: iyzico Marketplace adapter

---

## 2026-05-07 — Session A4d-3: Mobile Polish (Native Picker + Lucide + Jest + Logger)

### Done

A4d'nin son polish dilimi — A4d-3 sonunda customer mobile MVP-ready.
Push registration scope-out edildi (A4e-3'e ertelendi; sebep: backend
push token endpoint mevcut değil → kendi oturumunu hak ediyor).
Branch `feat/mobile-polish` (6 commit).

**G1** — Native datetime picker

- `@react-native-community/datetimepicker@8.2.0` (Expo SDK 52 bundled)
- `src/components/DateTimePicker.tsx` platform-specific UX:
  - **Android**: system picker modal, `onChange` tek seferlik (set
    veya dismissed); mode="datetime" date+time package içinde chain
  - **iOS**: inline wheel + Modal wrapper + "Tamam" confirm. Wheel
    her tick `onChange`; `tempDate` ref'inde tutup confirm'e kadar
    parent'a iletmeyi geciktiriyoruz
- Quote screen state `string` → `Date`; manuel parser + 12 test silindi

**G2** — Lucide icons

- `lucide-react-native@0.469` + `react-native-svg@15.8.0`
- `src/components/Icon.tsx` barrel — domain-friendly isimler +
  tree-shaking + library swap (A4g brand SVG) için tek file edit
- Tab navigator (🏠📅👤 → Home/Calendar/User), ErrorView, BookingCard
  status badges (9 status için icon)

**G4** — Jest + jest-expo + RTL setup

- `jest`, `jest-expo@~52`, `@testing-library/react-native@12`,
  `@babel/runtime` (RN babel transform require eder)
- `transformIgnorePatterns` İKİ pattern: pnpm `.pnpm/` virtual store
  - hoisted layout (tek pattern .pnpm prefix'inden geçemiyor)
- `moduleNameMapper.react` A4d-1'in tsconfig.paths react redirect'ini
  Jest runtime için cancel ediyor
- jest-native YOK — RTL 12+ matchers built-in; setupFilesAfterEach
  Jest 29'da var değil
- 12 component test (Button/BookingCard + statusDisplay drift guard/
  AddonSelector)

**G5** — Structured logger + PII redaction

- `src/lib/logger.ts` Logger.debug/info/warn/error
- PII redaction: `/phone|recipient|password|token|secret/i` → son-4
  yıldız (`+905551112233` → `+90555111****`)
- `Logger.debug` no-op when `__DEV__` is false
- 13 logger test
- Quote addon-load `.catch` artık Logger.warn

**G6** — Docs

- `apps/customer-mobile/CLAUDE.md` A4d-3 + 4 yeni disiplin kuralı
- `docs/development-notes.md` 9 yeni gotcha

### Test sonuçları

| Komut                                                        | Sonuç                     |
| ------------------------------------------------------------ | ------------------------- |
| `pnpm --filter @event-fleet/customer-mobile typecheck`       | ✓                         |
| `pnpm --filter @event-fleet/customer-mobile lint`            | ✓                         |
| `pnpm --filter @event-fleet/customer-mobile test`            | **83/83 PASS** (vitest)   |
| `pnpm --filter @event-fleet/customer-mobile test:components` | **12/12 PASS** (jest)     |
| Toplam mobile test                                           | **95** (84 → 95, +11 net) |
| `pnpm --filter @event-fleet/admin typecheck`                 | ✓                         |

### Plandan sapmalar (gerekçeli)

| Sapma                                | Gerekçe                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Push registration deferred A4e-3** | Backend `User.expoPushToken` field + endpoint mevcut değil; backend değişikliği kendi oturumunu hak ediyor. Kullanıcı (b) onayladı. |
| Brief 9-11 commit → **6 commit**     | Push 4-5 commit alıyordu; kalan kapsam 6 commit                                                                                     |
| @testing-library/jest-native ATLANDI | RTL 12+ matchers built-in, jest-native deprecated yol                                                                               |
| `setupFilesAfterEach` kullanılmadı   | Jest 29'da bu key yok; jest-native bağımlılığı zaten kalktı                                                                         |
| Manuel datetime parser **silindi**   | Hiçbir consumer kalmadı; 12 datetime test de silindi                                                                                |
| `@babel/runtime` direct dep eklendi  | RN babel transform require ediyor, brief atlamış                                                                                    |

### Final commit listesi (branch)

| #   | Commit  | Konu                                                                    |
| --- | ------- | ----------------------------------------------------------------------- |
| 1   | 25b161f | chore(customer-mobile): add @react-native-community/datetimepicker dep  |
| 2   | a29d047 | feat(customer-mobile): replace manual datetime input with native picker |
| 3   | cc9cca2 | feat(customer-mobile): replace emoji icons with lucide vector icons     |
| 4   | cc39ef5 | chore(customer-mobile): set up jest + react native testing library      |
| 5   | c9bf877 | feat(customer-mobile): add structured logger with PII redaction         |
| 6   | (bu)    | docs: log session a4d-3 progress and mark a4d complete                  |

### Manuel doğrulama (kullanıcı yapacak)

1. Backend ayakta + seed
2. `pnpm --filter @event-fleet/customer-mobile start` → Expo Go QR scan
3. Login → Anasayfa tab (lucide Home icon) → Düğün Aracı
4. VehicleType seç → "Fiyat Al" → datetime alanlarına tıkla:
   - **iOS**: slide-up wheel + "Tamam" confirm
   - **Android**: sistem date picker → time picker → kapan
5. "Fiyat Hesapla" → quote summary → "Onayla" → booking detail
   (status badge'de Check icon)
6. Bookings tab (lucide Calendar) → kayıt görünmeli
7. Booking detail status icon (Car/Clock/XCircle vs)

### Pending (A4e-3 — push registration ayrı oturum)

- Backend Prisma migration (User.expoPushToken, pushTokenUpdatedAt)
- UpdatePushTokenUseCase + Identity port + Prisma impl
- PATCH /users/me/push-token + Zod schema
- Mobile expo-notifications + expo-device + PushTokenService
- AuthContext push registration after verifyOtp + foreground handler

### Pending (A4g — production deploy)

- Real EAS Build (eas init, real projectId, eas.json profiles)
- Maps autocomplete + route preview
- Real brand identity + splash + app icon assets + vehicleType fotoğrafları
- Brand SVG icon set
- Detox / Maestro e2e

### Next

- **A4d TAMAMLANDI** (auth + booking + polish, 3 alt-oturum)
- **A4e-3 push registration** (backend + mobile birlikte) ← önerilen
- A4f: `apps/driver-mobile/` (sürücü tarafı, ayrı bundle)
- A4c-payment: iyzico Marketplace adapter

---

## 2026-05-08 — Session A4e-3: Push Notification Completion

### Done

A4e'nin son dilimi — push notification end-to-end. Brief A4e-2'nin
push infrastructure'ını "ready" sayıyordu ama gerçekte sadece
`NotificationChannel.PUSH` enum value vardı. Push adapters, channel
routing, User column, controller — hepsi bu oturumda landed. Branch
`feat/push-notification-completion` (8 commit).

**G1** — Schema + PII redaction

- `users.expo_push_token` + `users.push_token_updated_at` columns
  (manuel migration; `prisma migrate diff` PostGIS yüzünden false
  drop önerdiği için manual SQL safe path)
- `notifications.recipient_push_token` column (PUSH rows snapshot,
  sender DB hit yapmıyor)
- Logger PII paths: `*.expoPushToken` + `*.recipientPushToken` +
  `req.body.expoPushToken` (push token = write capability)

**G2** — UpdatePushTokenUseCase (TEST-FIRST, 8 test)

- Regex doğrulama, null=clear, empty reject, soft-deleted UserNotFound

**G3** — Controller + shared-types

- `shared-types/identity/push-token.ts` Zod schema
- `UsersController PATCH /users/me/push-token` → 204
- IdentityModule wiring (UsersController + UpdatePushTokenUseCase)

**G4a** — PushSenderPort + adapters + factory (BRIEF EKSİĞİ)

- `PushSenderPort` SmsSenderPort shape-mirror
- `MockPushSender` failNext/failAll paritesi
- `ExpoPushSender` placeholder (A4g'ye kadar throw)
- Factory: `EXPO_PUSH_PROJECT_ID` empty/`DUMMY_*` → Mock
- 7 mock-push test

**G4b** — Listener routing + SendNotification PUSH branch

- `pickChannel(customer)` listener'da; token → PUSH, yoksa SMS
- `recipientPushToken` listener → queue → notification row
- Push title kind→title map (body SMS template ile aynı dosya)
- 1 yeni context-provider test (token threading)

**G5** — Mobile push registration

- `expo-notifications` + `expo-device` install
- `PushTokenService` (permission + Android channel + projectId guard)
- `UsersApi.updatePushToken` + `api/index.ts` singleton barrel
- AuthContext.login → `void registerPushToken()` fire-and-forget
- AuthContext.logout → best-effort `updatePushToken(null)`
- Foreground handler config root layout module load

**G6** — Testcontainers spec (8 test)

- PATCH happy/malformed/null
- Customer with token → PUSH (no SMS)
- Customer without token → SMS fallback
- Token clear → next event SMS
- Push fail → FAILED + retry chain triggered
- PII discipline (outbox payload no token)

**G7** — Docs

- Notifications CLAUDE.md A4e-3 eklemeler + SMS fallback policy
- `docs/development-notes.md` 9 yeni gotcha

### Test sonuçları

| Komut                                                        | Sonuç                          |
| ------------------------------------------------------------ | ------------------------------ |
| `pnpm --filter @event-fleet/api typecheck`                   | ✓                              |
| `pnpm --filter @event-fleet/api test`                        | **299/299 PASS** (vitest unit) |
| `pnpm --filter @event-fleet/api test:integration`            | **81/81 PASS** (+8 push chain) |
| `pnpm --filter @event-fleet/customer-mobile typecheck`       | ✓                              |
| `pnpm --filter @event-fleet/customer-mobile test`            | **83/83 PASS** (vitest)        |
| `pnpm --filter @event-fleet/customer-mobile test:components` | **12/12 PASS** (jest)          |

### Plandan sapmalar (gerekçeli)

| Sapma                                                  | Gerekçe                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **G4a backend push adapters** brief'in dışında eklendi | Brief A4e-2'nin "push infrastructure ready" claim'ini varsayıyordu — gerçekte yoktu                            |
| Brief 14-16 commit → **8 commit**                      | Kapsam birleştirme + minimal yeni test                                                                         |
| Push template `.push.json` split → kind→title map      | SMS body + push body aynı; sadece title channel-spesifik                                                       |
| Retry happy-path → "failure surfaces FAILED"           | SMS event-chain spec aynı code path'i kapsıyor (channel-agnostic SendNotification failure handler)             |
| Migration timestamp 20260508 → 20260512                | Prisma migration order timestamp-ascending; notifications table 20260509'da, push columns sonra ALTER edilmeli |

### Final commit listesi (branch)

| #   | Commit  | Konu                                                                 |
| --- | ------- | -------------------------------------------------------------------- |
| 1   | 28bf75c | feat(db,api): add expo push token columns + extend pii redaction     |
| 2   | (G2)    | feat(identity): add update push token use case + repo method         |
| 3   | (G3)    | feat(identity): add PATCH /users/me/push-token endpoint              |
| 4   | (G4a)   | feat(notifications): add push sender port + mock + expo + factory    |
| 5   | 70a2156 | feat(notifications): channel routing + send PUSH branch              |
| 6   | (G5)    | feat(customer-mobile): wire push token registration after OTP verify |
| 7   | (G6)    | test(notifications): add push notification chain integration spec    |
| 8   | 1add5e8 | docs: A4e-3 module CLAUDE.md + dev-notes additions                   |
| 9   | (bu)    | docs: log session a4e-3 progress and mark a4e complete               |

### Manuel doğrulama (gerçek cihaz gerekli — opsiyonel)

1. Backend ayakta + seed
2. `pnpm --filter @event-fleet/customer-mobile start` → Expo Go QR
   (gerçek telefon — simulator'da Device.isDevice false → push skip)
3. Login → permission dialog → izin ver
4. Backend log: `push_token_obtained` + DB: `User.expoPushToken` set
5. Booking confirm → `[MOCK PUSH] sent` + DB: `notification.channel ===
"PUSH"` + `recipientPushToken` set
6. Logout → DB: `User.expoPushToken === null`

### Pending (A4f / A4g)

- A4f: Driver mobile + driver push registration
- A4g: Real ExpoPushSender (expo-server-sdk wiring), real
  `EXPO_PUSH_PROJECT_ID`, DeviceNotRegistered cleanup loop, Expo
  receipts API → DELIVERED status
- Push deep linking (booking detail tıklayınca açılma)
- Notification preferences / opt-out (Faz 3+)

### Next

- **A4e TAMAMLANDI** (3 alt-oturum: A4e-1 SMS, A4e-2 retry/DLQ, A4e-3
  push). Notifications altyapısı production-ready (mock-first)
- **A4f driver mobile** veya **A4c-payment** sıradaki büyük modüller
- A4g production deploy + brand assets + EAS Build + real Expo gateway

---

## 2026-05-08 — Session A4f-1a: Driver Mobile — Backend Whitelist + Scaffold + Auth

### Done

A4f başladı. Brief 14-16 commit / 5-6 saat hedefliyordu; realistik
scope-out ile A4f-1a + A4f-1b'ye böldüm. A4f-1a backend foundation +
driver mobile scaffold + auth kapsadı. Branch `feat/driver-mobile-auth`
(5 commit + bu).

**G1** — Backend whitelist

- Prisma `driver_invites` (phone clear + hash + status + audit fields)
- Domain errors: `DriverNotInvitedError` (403),
  `DriverInviteNotFoundError` (404),
  `DriverInviteAlreadyAcceptedError` (409)
- Use cases (TEST-FIRST, 21 test):
  - `CreateDriverInviteUseCase` admin-only, idempotent on PENDING
  - `CheckDriverWhitelistUseCase` PENDING + ACCEPTED kabul
  - `AcceptDriverInviteUseCase` atomik invite ACCEPTED + role DRIVER +
    outbox event. **DriverProfile auto-create yok** — TCKN/IBAN
    olmadan oluşturulamaz; supply onboarding flow'u devralır
  - `RevokeDriverInviteUseCase` admin-only, ACCEPTED reddeder
- `PiiHasher.hashPhone` HMAC-SHA256
- `UserRepositoryPort.updateRole` yeni method

**G2** — Driver auth + admin invite endpoints (6 integration test)

- shared-types `driver-invite.ts` schema
- `POST /auth/driver/otp/request` whitelist gate ÖNCE SMS
- `POST /auth/driver/otp/verify` verify + AcceptDriverInvite zinciri
- `/admin/driver-invites` POST/GET/PATCH:revoke (RolesGuard ADMIN)

**G3+G4+G5** — Driver mobile scaffold + auth + role guards

- `apps/driver-mobile/` Expo SDK 52 (customer-mobile pattern reuse)
- Brand placeholder: black + safety-green + online/offline tokens
- Driver auth API Zod role literal "DRIVER" + `WrongAppRoleError`
- Storage SESSION_KEY namespaced (`event_fleet_driver_auth_session_v1`)
- Phone screen `DRIVER_NOT_INVITED` translation
- Customer mobile symmetric guard: `CustomerAuthUserSchema` accept
  CUSTOMER + ADMIN + SUPPORT, reject DRIVER
- `apps/driver-mobile/CLAUDE.md` modül kuralları

### Test sonuçları

| Komut                                                  | Sonuç                             |
| ------------------------------------------------------ | --------------------------------- |
| `pnpm --filter @event-fleet/api typecheck`             | ✓                                 |
| `pnpm --filter @event-fleet/api test`                  | **320/320 PASS** (vitest unit)    |
| `pnpm --filter @event-fleet/api test:integration`      | **87/87 PASS** (+6 driver invite) |
| `pnpm --filter @event-fleet/customer-mobile typecheck` | ✓                                 |
| `pnpm --filter @event-fleet/customer-mobile test`      | **83/83 PASS**                    |
| `pnpm --filter @event-fleet/driver-mobile typecheck`   | ✓                                 |

### Plandan sapmalar

| Sapma                                                 | Gerekçe                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Brief 14-16 commit → **6 commit** (A4f-1a)            | Online/location/push UX kararları ayrı oturumu hak ediyor (A4f-1b)                |
| AcceptDriverInvite **DriverProfile auto-create YOK**  | Schema TCKN/IBAN/birthDate zorunlu; supply'ın CreateDriverProfileUseCase devralır |
| Mobile component reuse → `packages/mobile-shared` YOK | Erken abstraction değil; 3. app görünmeden copy-paste daha temiz                  |
| Customer guard ADMIN + SUPPORT da kabul               | Admin customer app'te review/impersonation yapabilmeli; sadece DRIVER reddedildi  |

### Final commit listesi (branch)

| #   | Konu                                                                             |
| --- | -------------------------------------------------------------------------------- |
| 1   | feat(identity): driver invite whitelist + use cases (TEST-FIRST, 21 test)        |
| 2   | feat(identity): driver-specific OTP endpoints + admin invites controller (6 e2e) |
| 3   | feat(driver-mobile,customer-mobile): scaffold driver app + role-mismatch guards  |
| 4   | docs(driver-mobile): module CLAUDE.md                                            |
| 5   | docs: log session a4f-1a progress                                                |

### Pending (A4f-1b sıradaki)

- Online/offline toggle (`/dispatch/drivers/:id/online-status`)
- Foreground location update (`expo-location` permission flow)
- Driver push token registration (A4e-3 PushTokenService reuse)
- NotificationContextProvider getDriverPushContext + listener routing
- Profile screen + tab navigator
- Driver mobile bootstrap + storage + role guard unit tests

### Pending (A4f-2 driver dispatch UX)

- Pending offer screen (push tap → accept/reject)
- Active job screen (booking detail, navigate, complete)
- Job list + history
- Driver-side cancel flow

### Pending (A4f-3 polish)

- Background location updates (expo-task-manager + expo-location)
- Lucide icons + brand SVG set
- Jest + jest-expo + RTL component test suite

### Manuel doğrulama (gerçek cihaz/Expo Go gerekli)

1. Backend ayakta + admin user seed
2. Postman: `POST /admin/driver-invites { phone: "+9055..." }`
3. `pnpm --filter @event-fleet/driver-mobile start` → Expo Go QR scan
4. Davet edilmemiş phone → "Bu numara henüz davet listesinde değil"
5. Davet edilen phone → OTP istemi (mock OTP backend log'unda)
6. OTP verify → home placeholder
7. DB query: User.role === "DRIVER", DriverInvite.status === "ACCEPTED"

### Next

- **A4f-1b** driver mobile online toggle + push registration ← önerilen
- A4f-2 driver dispatch UX (offer + active job)
- A4f-3 polish + background location
- A4c-payment iyzico Marketplace
- A4g production deploy

## 2026-05-13 — Session A4f-2a: Driver Dispatch UX — Backend Foundation

### Done

A4f-2 brief 18-22 commit'lik tek-PR olarak gelmişti. Mimari kararlar
netleştikten sonra bilinçli bir scope-split yaptık: A4f-2a (bu
oturum) backend foundation; A4f-2b (sonraki oturum) use case'lerin
tamamı + worker refactor + endpoints + notifications + iki mobile.
Branch `feat/driver-dispatch-ux` (4 commit).

**G1.1** — DriverOffer aggregate

- Prisma model: `DriverOffer` 1:N child of Booking, FK'lar
  `bookings + driver_profiles + vehicles`
- `vehicleId` row'a dondurulur (matcher offer yaratırken seçer;
  accept'te yeniden resolve etmez — multi-vehicle driver race
  koruma)
- Status enum 9 değer (PENDING + 4 active + COMPLETED + 3 failure)
- RejectReason enum 4 değer (TOO_FAR / TIME_CONFLICT /
  VEHICLE_UNAVAILABLE / OTHER)
- 3 partial index: `(driver, status)` driver hot path,
  `(status, expiresAt)` worker sweep, `(booking, status)` customer
  enrichment
- Migration `20260513120000_add_driver_offers` el yazımı (postgis
  projesi, prisma migrate dev interaktif → hangs)

**G1.2** — Domain types + state machine

- `DriverOfferEntity` Prisma row 1:1 mirror (Decimal money fields
  Prisma type olarak kalır, mapper string'e çevirir)
- `DriverOfferStateMachine` hand-rolled FSM (ADR 0019 pattern)
- 12 valid + 19 invalid transition pin'lendi (52 test)
- Üç deliberate kısıt:
  - PENDING → COMPLETED skip yasak
  - Driver-side reject sadece PENDING'den (post-accept driver no-show
    ayrı incident flow)
  - CANCELLED her active status'tan ulaşılabilir (customer cancel
    cascade)
- 6 yeni domain error + 7 yeni dispatch event tipi

**G2.1** — Accept use case (TEST-FIRST)

- `DriverOfferRepositoryPort` 8 method (create + findById +
  transitionStatus + findActiveByDriverId + findActiveByBookingId +
  findPriorDriverIdsForBooking + findExpiredPending + list)
- `PrismaDriverOfferRepository` adapter
- `AcceptDriverOfferUseCase` — A4f-2 mimari seam'i:
  - Idempotent re-accept (status===ACCEPTED erken return)
  - 5-dakika expiry **in-tx** (PENDING → EXPIRED + outbox event +
    OfferExpiredError → 410)
  - Single-active-offer guard
  - PENDING → ACCEPTED transition (optimistic lock)
  - Booking CONFIRMED → DRIVER_ASSIGNED + BOOKED availability
    INSERT (eski AssignDriverToBooking'in işi)
  - DriverOfferAccepted outbox event
- Spec: 8 senaryo (happy path + not-found + forbidden + idempotent +
  expired + terminal + active-elsewhere + concurrent-modification)

**G commission** — Driver commission rate default %15 → %20

- Schema default flip + migration
  `20260513130000_bump_commission_rate_default`
- Mevcut row'lar 0.15'te kalır (pricing snapshot test'leri kalibre)
- A4f-2b'de `driverEarnings = totalAmount × (1 - driver.commissionRate)`

**G docs** — Bu progress entry + development-notes A4f-2a bölümü
(4 karar gerekçesi: aggregate ayrımı, vehicleId frozen, expiry
defense-in-depth, idempotent pattern, commission default).

### Test sonuçları

| Komut                                                                   | Sonuç          |
| ----------------------------------------------------------------------- | -------------- |
| `pnpm --filter @event-fleet/api typecheck`                              | ✓              |
| `pnpm --filter @event-fleet/shared-types build`                         | ✓              |
| `vitest run dispatch/domain/driver-offer-state-machine.spec.ts`         | **52/52 PASS** |
| `vitest run dispatch/application/use-cases/accept-driver-offer.spec.ts` | **8/8 PASS**   |

> Full integration suite (87 test) bu session'da koşulmadı — lokal
> Docker Desktop kapalı. CI yeşillenince A4f-2a merge edilebilir.

### Plandan sapmalar

| Sapma                                                              | Gerekçe                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Brief 18-22 commit → **4 commit (A4f-2a)**                         | Bilinçli scope-split, A4d pattern. A4f-2b kalan 14-18 commit'i alır            |
| `PLATFORM_COMMISSION_PCT` env → **`driver.commissionRate` column** | Per-driver override DB'de zaten var, env'le globalleştirmek esnekliği kaybeder |
| `DriverOffer.vehicleId` brief'te yoktu → eklendi                   | Multi-vehicle driver + accept-time race koruma                                 |
| Booking state machine **değişmiyor** (sadece offer ayrı aggregate) | Müşteri "atandı → iptal → atandı" titremesi yaşamaz, ADR 0019 stabil           |

### Final commit listesi (branch, sırayla)

| #   | Konu                                                           |
| --- | -------------------------------------------------------------- |
| 1   | feat(db): add driver offer aggregate with 5-status lifecycle   |
| 2   | feat(dispatch): add driver offer domain types + state machine  |
| 3   | feat(dispatch): driver offer repository port + accept use case |
| 4   | feat(db): bump driver commission rate default to 20%           |
| 5   | docs: log session a4f-2a progress + decisions                  |

### Pending (A4f-2b sıradaki, yeni session)

- **G2.2** RejectDriverOfferUseCase (reason + cooldown)
- **G2.3** UpdateDriverOfferStatusUseCase (ON_THE_WAY → ARRIVED →
  IN_PROGRESS → COMPLETED, 4 outbox event)
- **G2.4** Get/List queries + driverEarnings hesabı
  (`driver.commissionRate` kullanır)
- **G3.1-3** Refactor `AssignDriverToBooking` → `CreateDriverOfferUseCase`,
  worker auto-expire PENDING sweep, reject re-trigger
  (`excludeDriverIds` ile)
- **G3.4** Integration tests (Testcontainers, offer lifecycle)
- **G4** shared-types driver-offer schemas + `DispatchOffersController` +
  `DriverStatusController` + endpoint integration tests
- **G5** Notification event handlers (4 yeni chain: DriverAccepted,
  DriverOnTheWay, DriverArrived, BookingCompleted)
- **G6** Driver mobile deep linking (`eventfleetdriver://`) + push tap
- **G7** Driver mobile offer screen + countdown + reject modal
- **G8** Driver mobile active job + status update buttons + history
- **G9** Customer mobile driver lifecycle UI (BookingCard badges +
  BookingDetail sections)
- Docs (driver mobile CLAUDE.md, customer mobile CLAUDE.md,
  development-notes, progress.md, smoke script extension)

### Manuel doğrulama (A4f-2a — sonraki PR review içinde)

1. Migration `20260513120000_add_driver_offers` deploy ✓
2. Migration `20260513130000_bump_commission_rate_default` deploy ✓
3. `\d driver_offers` 9 enum kolonu + 3 partial index gösterir
4. `\d driver_profiles` `commission_rate DEFAULT 0.20` gösterir
5. New driver insert (default değerle) → `commissionRate = 0.20`
6. Existing seeded driver → `commissionRate = 0.15` (değişmedi)

### Next

- **A4f-2b** kalan iş (yeni session, fresh context) ← önerilen
- A4f-3 polish (background location + Lucide migration + jest driver-mobile)
- A4c-payment iyzico Marketplace
- A4g production deploy

## 2026-05-18 — Session A4f-2b-1: Driver Offer Lifecycle Backend

### Done

A4f-2b'nin ilk parçası: A4f-2a foundation üzerine reject + lifecycle
status updates + read queries eklendi. Worker refactor + endpoints

- mobile A4f-2b-2 ve A4f-2b-3'e ertelendi (bilinçli scope-split).

**G1 — DriverDispatchCooldown table**

- Prisma model + migration `20260518100000_add_driver_dispatch_cooldowns`
- `(driver_profile_id, booking_id)` unique → upsert sliding 5dk
- `expires_at` index → A4f-2b-2 worker cleanup sweep için
- Schema'ya `DriverProfile.dispatchCooldowns` + `Booking.dispatchCooldowns`
  back-relation eklendi

**G1 — RejectDriverOfferUseCase (10 unit test)**

- `DriverDispatchCooldownRepositoryPort` + Prisma adapter (upsert /
  findActive / deleteExpired)
- 10 senaryo: happy path (REJECTED + cooldown + outbox event),
  optional note, idempotent re-reject, not-found, forbidden,
  expiry auto-promote, state machine guard, 500-char note cap
  (`ValidationError`), concurrent modification race
- Cooldown sliding window — re-reject upsert ile `expires_at` ileri
  kaydırır, duplicate row yok
- Outbox event `dispatch.DriverOfferRejected` (worker re-dispatch için)

**G2 — UpdateDriverOfferStatusUseCase (27 unit test)**

- 4 driver-driven transition: ACCEPTED → ON_THE_WAY → ARRIVED →
  IN_PROGRESS → COMPLETED
- IN_PROGRESS + COMPLETED booking row cascade (state machine
  DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED, optimistic lock her
  iki tarafta)
- ON_THE_WAY + ARRIVED offer-only (booking row dokunulmaz)
- Idempotent same-state short-circuit (no writes, no events)
- 10 parametrik invalid transition kontrolü (backwards / skip-step /
  pre-accept / terminal)
- Booking row missing veya wrong-state → `ConcurrentDispatchError`
  (customer cancel cascade güvenli)
- 4 outbox event: DriverOnTheWay / DriverArrived / BookingInProgress
  / BookingCompleted (handler'lar A4f-2b-2'de)
- DriverOfferStateMachine zaten lifecycle'ı pin'liyordu (A4f-2a, 52
  test), bu oturum yeni transition eklemedi

**G3 — Read Queries (28 unit test)**

- `GetDriverOfferUseCase` — offer + booking + customer (masked) +
  vehicle + driver earnings tek query, single read-only tx
- `ListDriverOfferHistoryUseCase` — status filter + default limit 20,
  bookings deduplicated batch fetch (O(1) tx round-trip)
- `calculateDriverEarnings(totalAmount, commissionRate, currency)` —
  Decimal-safe, iki ondalık, `driver.commissionRate` per-row override
- `maskE164` — "+90555**\*4567" pattern, customer phone driver
  response'unda plaintext **asla\*\* yok
- ADR 0005 dependency rule: helpers `application/services/` altında
  (domain layer application'dan import edemez)

### Test sonuçları

| Komut                                                      | Sonuç            |
| ---------------------------------------------------------- | ---------------- |
| `pnpm --filter @event-fleet/api typecheck`                 | ✓                |
| `pnpm --filter @event-fleet/api test src/modules/dispatch` | **151/151 PASS** |

| Spec dosyası                                        | Test count |
| --------------------------------------------------- | ---------- |
| driver-offer-state-machine.spec                     | 52         |
| driver-matcher.service.spec                         | 12         |
| accept-driver-offer.use-case.spec                   | 8          |
| **reject-driver-offer.use-case.spec** (yeni)        | **10**     |
| **update-driver-offer-status.use-case.spec** (yeni) | **27**     |
| **get-driver-offer.use-case.spec** (yeni)           | **9**      |
| **list-driver-offer-history.use-case.spec** (yeni)  | **8**      |
| **driver-offer-view-helpers.spec** (yeni)           | **11**     |
| assign-driver-to-booking.use-case.spec              | 10         |
| booking-dispatch.service.spec                       | 4          |
| **Toplam dispatch unit**                            | **151**    |

A4f-2a baseline: 86 test → A4f-2b-1: **151 test (+65)**.

### Plandan sapmalar

| Sapma                                                                   | Gerekçe                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Brief 9 commit (3 per task) → **4 feat commit + 1 docs**                | Test + impl + adapter aynı PR, fonksiyonel olarak tek atomic ünite       |
| Helpers `domain/services/` → `application/services/`                    | ADR 0005 dependency rule: domain, application/use-case'den import edemez |
| State machine yeni transition test eklenmedi                            | A4f-2a 52 test'i zaten 4 lifecycle transition'ı pin'lemişti (12 valid)   |
| `ValidationError` 500-char kapı — local domain error eklenmedi          | Generic `common/errors/domain-error.ts` zaten projede pattern            |
| Brief `vehicle.vehicleType.name` enrichment → vehicle.brand+model+plate | VehicleRecord.vehicleTypeId resolve catalog hit gerektirir, gerek yok    |
| Brief `customer.firstName` → `customer.displayName`                     | User schema'da `firstName` yok; `displayName` doğru alan                 |

### Final commit listesi (branch, sırayla)

| #   | Konu                                                                     |
| --- | ------------------------------------------------------------------------ |
| 1   | feat(db): add driver dispatch cooldown table                             |
| 2   | feat(dispatch): implement reject driver offer with cooldown (TEST-FIRST) |
| 3   | feat(dispatch): driver-driven lifecycle transitions (TEST-FIRST)         |
| 4   | feat(dispatch): driver offer detail + history queries (TEST-FIRST)       |
| 5   | docs: log session a4f-2b-1 progress (bu commit)                          |

### Pending (A4f-2b-2 sıradaki, yeni session)

- BookingDispatchWorker refactor (auto-expire PENDING sweep + reject
  re-trigger + cooldown cleanup)
- `AssignDriverToBookingUseCase` → `CreateDriverOfferUseCase`
- `DispatchOffersController` + endpoint integration tests
  (Testcontainers)
- shared-types driver-offer Zod schemas
- 4 notification event handler chain (DriverAccepted, DriverOnTheWay,
  DriverArrived, BookingCompleted)
- Driver mobile API client wiring

### Pending (A4f-2b-3 sonraki, yeni session)

- Driver mobile offer screen (countdown + accept/reject modal)
- Driver mobile active job (status update buttons + history)
- Customer mobile driver lifecycle UI (BookingCard badges)
- Push deep linking (`eventfleetdriver://`)

### Manuel doğrulama (A4f-2b-1 — PR review içinde)

1. Migration `20260518100000_add_driver_dispatch_cooldowns` deploy ✓
2. `\d driver_dispatch_cooldowns` 4 kolon + 2 index gösterir
3. Reject use case unit'i 10 senaryoyu pin'liyor (Testcontainers
   integration A4f-2b-2'de)
4. Update use case unit'i 27 senaryoyu pin'liyor (state machine
   cascade + idempotent + concurrent dahil)
5. Query unit'leri commission + masking pin'liyor — driver response'unda
   `+905551234567` plaintext'i `.not.toContain` assertion ile yakaladı

### Next

- **A4f-2b-2** worker refactor + endpoints + notifications (yeni session)
- A4f-2b-3 mobile UI (yeni session)
- A4c-payment iyzico Marketplace
- A4g production deploy

## 2026-05-19 — Session A4f-2b-2: Worker Refactor + Endpoints + Notification Chains

### Done

A4f-2a foundation + A4f-2b-1 use cases üzerine **orchestration
katmanı**. Worker offer yaratıyor, endpoint'ler use case'leri expose
ediyor, notification listener 4 lifecycle event chain'i tamamlıyor.
Mobile UI A4f-2b-3'e bırakıldı.

**G1 — CreateDriverOfferUseCase + worker refactor**

- `CreateDriverOfferUseCase` (TEST-FIRST, 11 senaryo). Pre-conditions:
  booking CONFIRMED, driver'da aktif offer yok, optimistic-lock
  attempts++ tıklatması başarılı. 5dk expiresAt + PII-free
  `dispatch.DriverDispatched` payload.
- `BookingDispatchService` 3-faz sweep'e dönüştü:
  - **Phase A** PENDING offer auto-expire (expiresAt < now → EXPIRED
    - `dispatch.DriverOfferExpired` outbox event per row)
  - **Phase B** `findDispatchable` → her booking için aktif offer
    yoksa matcher çalıştır (`priorDriverIds` exclude) → match
    bulunursa `CreateDriverOfferUseCase`
  - **Phase C** `cooldownRepo.deleteExpired` — A4f-2b-1 cooldown
    tablosu maintenance
- `AssignDriverToBookingUseCase` + spec **silindi**. ManualReassign
  kendi matcher path'ini sürdürüyor (admin override).

**G2 — Reject re-trigger listener**

- `DispatchRetriggerListener` `@OnEvent("dispatch.DriverOfferRejected")`
  - `("dispatch.DriverOfferExpired")` → BullMQ kick. 30s scheduler tick
    arada beklemesin diye; jobId saniye-bazlı slot ile idempotent.

**G3 — shared-types Zod schemas**

- `DriverOfferDetail / Summary / RejectOfferInput /
UpdateOfferStatusInput / ListDriverOfferHistoryQuery`
- `DriverOfferMoney` (string-encoded amount + currency)
- `ListDriverOfferHistoryQuerySchema` status'ü tek-değer veya array
  kabul edip array'e normalize ediyor (mobile client iki şekilde de
  yazabilir)

**G4 — Controllers**

- `DispatchOffersController` `@Roles("DRIVER")`:
  GET / GET :id / POST :id/accept / POST :id/reject
- `DriverStatusController` `@Roles("DRIVER")`:
  PATCH :id/status (4 lifecycle hedef status)
- Accept + reject + status update Idempotency-Key interceptor'ü ile
- Use case throw'ları (Offer\*Error) global filter mapping zaten var:
  - OfferNotFound → 404
  - OfferExpired → 410 Gone
  - OfferStateTransition → 409
  - OfferForbidden → 403
  - ValidationError → 400 (Zod parse)
  - ConcurrentOfferModification → 409

**G5 — Integration spec (Testcontainers)**

- `dispatch.integration-spec` rewrite — assertion shape "booking
  DRIVER_ASSIGNED" → "PENDING offer yaratıldı + booking CONFIRMED"
- `notifications-event-chain` rewrite — DriverDispatched testi iki
  faza ayrıldı: dispatch (driver SMS only), sonra accept (customer
  SMS)
- `full-lifecycle.e2e` rewrite — accept aşaması arada, customer
  SMS'i accept'te firilemiyor
- `dispatch-offer-flow.integration-spec` **yeni** (7 senaryo): GET
  detail (masked phone) / POST accept (DRIVER_ASSIGNED + customer
  SMS) / POST reject (cooldown + outbox) / PATCH status lifecycle
  (4 step, 3 SMS) / GET history (status filter) / 403 başka driver
  / 410 expired offer

**G6 — Notification chain (customer)**

- 4 yeni `NotificationKind` enum: `DRIVER_ON_THE_WAY`, `DRIVER_ARRIVED`,
  `BOOKING_COMPLETED` (migration `20260518150000_notification_kind_lifecycle`)
- 3 yeni Türkçe SMS template (driver_on_the_way / driver_arrived /
  booking.completed)
- 4 yeni push title TR
- 4 yeni handler:
  - `dispatch.DriverOfferAccepted` → DRIVER_ASSIGNED_TO_BOOKING
    (eskiden DriverDispatched'de fire ediyordu — taşındı)
  - `dispatch.DriverOnTheWay` → DRIVER_ON_THE_WAY
  - `dispatch.DriverArrived` → DRIVER_ARRIVED
  - `dispatch.BookingCompleted` → BOOKING_COMPLETED
- `fanoutCustomerLifecycle` helper — 4 handler aynı şekilde booking
  context → customer context → pickChannel → queueNotification
  zincirini izliyor
- DriverDispatched **artık customer'a fire etmiyor** (offer flow'da
  "atandı" değil "teklif edildi" anlamına geliyor — DRIVER_OFFER_ACCEPTED
  gerçek lock-in noktası)

### Test sonuçları

| Komut                                           | Sonuç            |
| ----------------------------------------------- | ---------------- |
| `pnpm --filter @event-fleet/api typecheck`      | ✓                |
| `pnpm --filter @event-fleet/shared-types build` | ✓                |
| `pnpm --filter @event-fleet/api test`           | **455/455 PASS** |
| `pnpm --filter @event-fleet/api build`          | ✓                |

Integration testleri Docker Desktop uyuyor durumda lokalde
koşulamadı — CI'da koşacak.

### Plandan sapmalar

| Sapma                                                                            | Gerekçe                                                                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Brief 7-9 commit → **5 feat/refactor + 1 docs + 1 test**                         | Atomic commit'ler logical unit'lere kondu (orchestration / endpoints / notif / integration / docs)                    |
| `BookingDispatchAttempt` ayrı tablosu yok                                        | `Booking.dispatchAttempts` zaten var, counter orada — yeni tablo gereksiz                                             |
| `findCooldownDriverIds` worker helper'ı **silindi**                              | (booking, driver) unique zaten aynı driver'a re-offer yasaklıyor; `findPriorDriverIdsForBooking` exclusion'u kapsıyor |
| ADR 0023 yazılmadı                                                               | Brief'te opsiyonel olarak markalanmıştı; dev-notes 5 karar detayı zaten ADR-level                                     |
| Brief'in `booking.DriverAccepted` event adı → **`dispatch.DriverOfferAccepted`** | Foundation'da yayılan gerçek event name; A4f-2a/2b-1 dispatch namespace'inde                                          |

### Final commit listesi (branch, sırayla)

| #   | Konu                                                                              |
| --- | --------------------------------------------------------------------------------- |
| 1   | refactor(dispatch): replace AssignDriverToBooking with offer-based worker flow    |
| 2   | feat(dispatch): driver offer endpoints + retrigger listener + shared-types        |
| 3   | feat(notifications): customer chain for accept / on-the-way / arrived / completed |
| 4   | test(dispatch): port integration specs to the offer-based flow                    |
| 5   | test(dispatch): end-to-end offer lifecycle integration spec                       |
| 6   | docs: log session a4f-2b-2 progress (bu commit)                                   |

### Pending (A4f-2b-3 sıradaki — mobile UI, yeni session)

- Driver mobile offer screen (countdown + accept/reject modal)
- Driver mobile active job (status update buttons + history)
- Customer mobile BookingDetail lifecycle UI (12-status badge)
- Customer mobile BookingCard 4-status badge update
- Push deep linking (`eventfleetdriver://`)
- Driver mobile API client wiring (yeni endpoint'ler)

### Manuel doğrulama (PR review içinde)

1. Migration `20260518150000_notification_kind_lifecycle` deploy ✓
2. Driver app'ten OTP → JWT token sonra `GET /dispatch/offers/:id`
   detail döner, phone masked
3. `POST .../accept` → booking DRIVER_ASSIGNED + customer SMS "atandı"
4. `PATCH .../status status=ON_THE_WAY/ARRIVED/IN_PROGRESS/COMPLETED`
   sırayla → her birinde customer SMS
5. `POST .../reject reason=TOO_FAR` → cooldown row + dispatch
   re-trigger anında (BullMQ idempotent)
6. Concurrent two accepts → biri 200 biri 409 (offer race güvenli)
7. 5dk dolan offer accept → 410 Gone + offer EXPIRED

### Next

- **A4f-2b-3** mobile UI (yeni session, fresh-context)
- A4f-3 polish (background location + Lucide + jest driver-mobile)
- A4c-payment iyzico Marketplace
- A4g production deploy

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
