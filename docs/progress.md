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
