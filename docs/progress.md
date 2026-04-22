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
