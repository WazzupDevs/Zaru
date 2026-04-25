# Phase 1 Closeout — User & Supply Foundation

**Status:** Complete
**Date:** 2026-04-25
**Span:** 2026-04-22 → 2026-04-25 (4 takvim günü, 8 oturum)

## Kapsam

Faz 1 hedefi: **iki taraflı pazaryerinin "supply" tarafı çalışır halde**.
Bir kullanıcı uygulamadan kayıt olabilmeli, sürücü olarak başvurabilmeli,
gerekli evrağı yükleyebilmeli, admin onayından geçtikten sonra araç
ekleyip takvim açabilmeli. Booking, payment, dispatch ve mobile app Faz 2+
(A4+) kapsamında.

## Oturum Tarihçesi

| Oturum  | Tarih      | Branch                           | Konu                                                         |
| ------- | ---------- | -------------------------------- | ------------------------------------------------------------ |
| A1      | 2026-04-22 | `feat/identity-foundations`      | Monorepo + Postgres + Redis + Prisma + ilk 3 tablo + 4 ADR   |
| A2a     | 2026-04-22 | `feat/auth-complete`             | NestJS bootstrap + OTP request + idempotency + rate limit    |
| A2b     | 2026-04-23 | `feat/auth-complete`             | Soft-delete extension + identity scaffolding                 |
| A2c     | 2026-04-23 | `feat/auth-complete`             | OTP verify + JWT + refresh rotation + reuse detection        |
| A2c-fup | 2026-04-24 | `feat/async-infrastructure`      | Redis sliding window rate limiter + BullMQ outbox worker     |
| A3a     | 2026-04-23 | `feat/supply-catalog`            | ClockPort + polymorphic catalog + admin scaffold             |
| A3b     | 2026-04-24 | `feat/supply-driver-profiles`    | Storage (MinIO+R2) + supply core (Driver/Vehicle/Document)   |
| A3c     | 2026-04-25 | `feat/supply-availability-admin` | Vehicle availability + admin bootstrap + admin UI + closeout |

## Ne Kuruldu

### Monorepo + Build Pipeline

- Turborepo + pnpm workspaces (`apps/*`, `packages/*`)
- Volta-pinned Node 20.18.0 + pnpm 9.15.0
- Husky pre-commit (lint-staged) + commitlint (Conventional Commits)
- GitHub Actions CI: lint + typecheck + build + unit + integration (Testcontainers)
- Branch protection: PR akışı zorunlu (main'e direct push yok)

### Backend (NestJS Modüler Monolit)

- 4-katman pattern her modülde: `domain/` → `application/` → `infrastructure/` → `interface/`
- ESLint cross-layer guard (ADR 0005) — domain → application yasaklı, vs.
- Pino logger + redaction (PII, secrets, tokens)
- AsyncLocalStorage request context (ULID requestId + userId)
- Domain error hierarchy + global exception filter
- Health endpoints (`/healthz`, `/readyz`) — Postgres + Redis + Storage check

### Veri Katmanı

- PostgreSQL 16 + PostGIS + pgcrypto (Docker dev)
- Prisma 5.22 ORM + soft-delete extension
- UUID v7 (zaman-sıralı, plpgsql function)
- Transactional outbox (ADR 0004) — `OutboxEvent` table + `next_attempt_at` retry
- BullMQ outbox worker — `SELECT FOR UPDATE SKIP LOCKED` + exponential backoff
- Idempotency records — TTL cleanup worker
- Partial unique indexes (soft-delete uyumlu): `users.phone_e164`,
  `driver_profiles.user_id`, `vehicles.plate_number`

### Modüller (Bounded Contexts)

| Modül              | Kapsam                                                         | Status   |
| ------------------ | -------------------------------------------------------------- | -------- |
| identity           | OTP, JWT (15dk access + 30g refresh rotation), reuse detection | Complete |
| catalog            | ServiceCategory, VehicleType, polymorphic AttributeDefinition  | Complete |
| supply             | DriverProfile, Vehicle, Document, VehicleAvailability          | Complete |
| pricing            | (A4)                                                           | Pending  |
| dispatch           | (A4)                                                           | Pending  |
| booking            | (A4)                                                           | Pending  |
| payment            | (A4)                                                           | Pending  |
| messaging          | (A4+)                                                          | Pending  |
| notifications      | (A4)                                                           | Pending  |
| reviews            | (A4+)                                                          | Pending  |
| billing-compliance | (A4+)                                                          | Pending  |
| analytics-events   | (A4+)                                                          | Pending  |

### Common Infrastructure

- `ClockPort` (global, FrozenClock test fake)
- `TxRunnerPort` + `OutboxWriterPort` (common/persistence)
- `RateLimiterPort` (Redis sliding-window-log, Lua atomic)
- `StoragePort` (S3-compatible, dev MinIO + prod R2)
- `PiiHasher` (HMAC-SHA256 TCKN + argon2id IBAN)
- `IdempotencyInterceptor` (endpoint-level)
- `JwtAuthGuard` + `RolesGuard` (global, decorator-driven)
- `Public()` + `Roles(...)` decorators

### Admin Panel (Next.js 15)

- Route guards: `useRequireAuth({ requireRole: "ADMIN" })` ile protected layout
- OTP login (admin role check post-verify)
- Dashboard: pending count card + Kuyruğu Aç button
- `/drivers/pending`: tablolu queue + Onayla/Reddet butonları + Idempotency-Key
- Minimal UI primitives (clsx + tailwind-merge + cva, shadcn alternative)
- Strict ESLint parity ile root config'e denk

### Bootstrap Tooling

- `BOOTSTRAP_ADMIN_PHONE` env + `pnpm db:seed` admin upsert (dev/test only)
- `pnpm api:promote-admin <phone>` CLI (prod) — outbox audit
- MinIO bucket auto-ensure on dev startup (`StorageBootstrapService`)
- Wedding-car category seed (1 ServiceCategory + 4 VehicleTypes + 5 AttributeDefs)

## ADR Listesi

| ADR  | Konu                                        | Status   |
| ---- | ------------------------------------------- | -------- |
| 0001 | OTP-only registration (TR mobile)           | Accepted |
| 0002 | Modular monolith                            | Accepted |
| 0003 | Data conventions (UUIDv7, soft-delete, ...) | Accepted |
| 0004 | Transactional outbox                        | Accepted |
| 0005 | Cross-module dependency rule                | Accepted |
| 0006 | UUIDv7 primary keys                         | Accepted |
| 0007 | Vitest + SWC for NestJS DI metadata         | Accepted |
| 0008 | Refresh token rotation + reuse detection    | Accepted |
| 0009 | Outbox worker (BullMQ + SKIP LOCKED)        | Accepted |
| 0010 | OTP attempt persistence (split tx pattern)  | Accepted |
| 0011 | Rate limit strategy (Redis sliding window)  | Accepted |
| 0012 | Polymorphic catalog model                   | Accepted |
| 0013 | Storage: S3-compatible presigned PUT        | Accepted |
| 0014 | Clock port injection                        | Accepted |
| 0015 | Admin bootstrap (seed + CLI)                | Accepted |
| 0016 | PII hashing strategy (HMAC + argon2id)      | Accepted |

## Test Kapsamı

| Suite               | Sayım    | Notlar                                     |
| ------------------- | -------- | ------------------------------------------ |
| api unit            | 115+     | VOs, use cases, hashers, builders          |
| api integration     | 47+      | Testcontainers Postgres+Redis+MinIO        |
| api e2e (lifecycle) | 1        | Faz 1 closeout proof — full driver journey |
| shared-types unit   | 49       | Zod schema validation                      |
| **Toplam**          | **210+** | All gating CI                              |

## Güvenlik Mihenk Taşları

- **PII at rest:** TCKN HMAC, IBAN argon2id, plaintext kolon yok (ADR 0016).
- **PII in transit:** Pino redaction `*.nationalId`, `*.iban`, `*.tokenHash`,
  `*.codeHash`, `*.phoneE164`, etc.
- **PII in events:** outbox event payload'larına PII koymak yasak — defansif
  smoke assertion (`JSON.stringify(payload).not.toContain(VALID_TCKN)`).
- **OTP brute force:** per-phone 60sn 1, hourly 5, per-IP 60sn 3, verify
  hourly 10. Rate limiter Redis Lua atomic. ADR 0011.
- **OTP attempt persist:** wrong-code attempt counter ayrı tx'te commit
  edilir, throw rollback'i hayatta kalır. ADR 0010.
- **Refresh reuse:** revoked token kullanılırsa cascade family revoke +
  RefreshReuseDetected event. ADR 0008.
- **Idempotency:** Redis lock + DB persist, hash-based replay.
- **Auth/role:** JwtAuthGuard her request'te DB'den hydrate (token revoke
  / role downgrade hemen yansır). RolesGuard global.
- **Storage:** Content-Length signed presigned PUT — client max-size bypass
  edemez (S3 reddeder).
- **Admin bootstrap:** prod'da seed admin yaratmaz; CLI manual + outbox audit.
  ADR 0015.

## Bilinçli Ertelemeler

- **Booking + Pricing + Dispatch:** Faz 2 (A4) — XState state machine,
  PricingStrategy, dispatch matching algoritması.
- **Payment (iyzico marketplace):** A4 — provizyon, capture, payout, webhook
  dedup.
- **Notifications + SMS real:** A4 — Netgsm HTTP integration + İleti Merkezi
  failover.
- **Sentry + OpenTelemetry:** A4 — prod observability.
- **Coolify + Hetzner deploy:** A4 — prod-ready Docker pipeline.
- **Mobile app (Expo):** A4+ — customer ve driver ayrı.
- **Document virus scan + EXIF strip + thumbnail:** A4+ — post-upload pipeline.
- **Admin panel UI tamamı:** A3c MVP'sinden geniş — catalog editor, KPIs,
  document review (per-document, dialog'lu), notification center, vs A4+.
- **Branch protection rule (Team plan):** prod hazırlığında değerlendirme.
- **TCKN/IBAN secret rotation:** A4+ runbook + dual-write window pattern.
- **HTTP-only cookie auth:** A4 — admin localStorage MVP'den geçiş.

## Öğrendiklerimiz (Workflow & Security)

- **Transaction + domain error tuzağı (ADR 0010)** — accounting writes ayrı tx'te.
- **MinIO Testcontainers** — `mc` binary lifecycle yerine S3Client + JS bucket bootstrap.
- **Prisma migrate dev TTY** — non-interactive shell'de çalışmaz; `migrate diff
--script` + manuel migration klasörü + `migrate deploy` akışı.
- **Vitest + NestJS DI** — `unplugin-swc` + `@swc/core` zorunlu (decorator
  metadata için), ADR 0007.
- **Cross-layer ESLint guard** — domain'den catalog/application'a import =
  attribute-validator domain'den application'a taşındı.
- **Half-open `[start, end)` interval** — adjacent availability ranges OK,
  `tstzrange '[)' && tstzrange '[)'` ile ekvivalan.
- **Next.js 15 useSearchParams Suspense** — prerender bailout.
- **CreateBucketCommand idempotent değil** — try/catch + isAlreadyOwned.

## A4'e Hazırlık (Faz 2: Müşteri Rezervasyon ve Ödeme)

Faz 2'nin başlangıç hedefi: **müşteri uygulamasından bir rezervasyon
oluşturulup parası provizyona alınabiliyor**.

Sıradaki büyük modüller:

1. **Booking** — XState state machine (PROPOSED → CONFIRMED → IN_PROGRESS →
   COMPLETED / CANCELLED), Quote (TTL + imza, sunucu tarafında üretilir),
   booking attributes (catalog scope=BOOKING).
2. **Pricing** — PricingRule + PricingStrategy (strategy pattern), seasonal
   multipliers, distance/duration matrix cache.
3. **Dispatch** — driver matching (PostGIS distance + availability), offer
   broadcasting, accept/reject lifecycle, reassignment.
4. **Payment** — iyzico Alt Üye İşyeri (Marketplace), provizyon → capture →
   payout, webhook dedup, wallet ledger.
5. **Notifications** — multi-channel (push + SMS + email), event-driven.
6. **Mobile apps** — React Native + Expo, customer ve driver ayrı app.

Yan yatay işler:

- Sentry + OpenTelemetry + Grafana Cloud free
- Coolify + Hetzner prod deploy (Coolify exec runbook A4)
- NetgsmSmsSender real HTTP + İleti Merkezi failover
- Feature flag (Unleash self-host)
- Branch protection rule değerlendirmesi (Team plan)
- TCKN/IBAN HMAC secret rotation runbook

## Referanslar

- ADR'lar: `docs/adr/0001..0016`
- Workflow notları: `docs/development-notes.md` (gotcha defteri)
- Oturum logları: `docs/progress.md`
- Roadmap: `docs/roadmap.md`
- Glossary: `docs/glossary.md`
- Lifecycle e2e: `apps/api/test/driver-onboarding-lifecycle.e2e-spec.ts`
