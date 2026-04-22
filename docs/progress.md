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
