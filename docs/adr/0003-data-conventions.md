# ADR 0003 — Data Conventions (UUID, timestamps, soft delete, optimistic locking, partial unique)

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

12 bounded context'in 12 farklı şekilde id, zaman damgası, silme, concurrency ve
benzersizlik konvansiyonu kullanması en pahalı drift kaynağıdır. ORM'ler (Prisma) tek
başına bunu zorlamaz; konvansiyonu yazıya dökmek + her yeni tablonun bunlara uyduğunu
PR review'da kontrol etmek gerek.

İki spesifik tuzak baştan çözülmek zorunda:

1. **Phone uniqueness ile soft delete çatışması** — bir kullanıcı silinince aynı telefonla
   yeniden kayıt yapılabilmeli. Klasik unique constraint bunu engeller.
2. **UUID v7 vs v4** — UUID v7 zaman-sıralı (B-tree friendly, daha iyi index locality)
   ama PostgreSQL 16 native fonksiyon getirmiyor. Şu anki üretim datası sıfır olduğu için
   v4 ile başlamak risk değil, ileride göç edilebilir.

## Decision

### 1) Primary key

- **`id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`** — başta UUID v4.
- Postgres 16'da UUID v7 native değil; A2'de SQL fonksiyonu (`uuidv7()`) eklenip
  `default(dbgenerated("uuidv7()"))` olarak migration ile geçilecek (ayrı ADR ile).
- Bu oturumda üretim verisi yok → v4 → v7 göçü risksiz.

### 2) Zorunlu meta kolonlar (her tabloda)

```
created_at  TIMESTAMP NOT NULL DEFAULT now()
updated_at  TIMESTAMP NOT NULL  -- Prisma @updatedAt
deleted_at  TIMESTAMP NULL      -- soft delete sentinel
```

### 3) Optimistic locking

- **Sadece kritik aggregate'lerde** `version Int @default(0)`:
  - Booking, Payment, Wallet (Faz 3'te gelecek)
  - Diğer tablolarda zorunlu değil (write contention düşük).
- Update query her zaman `WHERE id = ? AND version = ?` filtresi + `SET version = version + 1`.
- Conflict yiyen update 0 row affected → application layer'da `OptimisticLockError` fırlatır.

### 4) Multi-tenancy hazırlığı

- `tenant_id UUID NULL` her **kullanıcı-veri** tablosunda kolon olarak hazır
  (`OutboxEvent` gibi platform-içi tablolarda yok).
- Mantık katmanı şu an yok — single tenant mode. İlk tenant ihtiyacı çıkınca:
  - middleware: her authenticated request'e `tenant_id` set et
  - Prisma extension: query-level `where: { tenantId }` zorunluluğu

### 5) Soft delete

- Her sorgu default `WHERE deleted_at IS NULL` filtresinden geçecek.
- A2'de Prisma ClientExtension yazılacak (eski `$use` middleware deprecate olduğu için
  `$extends` ile). `findMany`, `findFirst`, `findUnique`, `update`, `delete` sarmalanır.
  Escape hatch: `prisma.user.findMany({ ..., includeDeleted: true } as any)` benzeri
  type-safe argüman.
- Hard delete sadece **KVKK DSAR** (kullanıcı verisini sil talebi) ve **audit log
  retention** dışındaki ihlal senaryolarında.

### 6) Partial unique index — phone uniqueness

Şu migration'la çözüldü:

```sql
CREATE UNIQUE INDEX users_phone_e164_active_unique
    ON users(phone_e164) WHERE deleted_at IS NULL;
```

Soft-delete edilmiş kullanıcılar bu unique constraint'in dışında kalır → aynı telefon
yeniden kullanılabilir. Aktif kullanıcılar arasında hala unique.

Aynı pattern her "doğal anahtar + soft delete" çiftinde uygulanmalı (örn. ileride
sürücüye verilen plaka, kategori slug'ı vs).

### 7) Phone format validasyonu

- **TR mobile only**: `^\+90(5)\d{9}$` — sadece Türkiye GSM (5xx) hatları.
- A2'de `packages/shared-types`'ta Zod schema:
  ```ts
  export const PhoneE164 = z.string().regex(/^\+90(5)\d{9}$/);
  ```
- **Gerekçe:** SMS pumping fraud (premium-rate yurt dışı numaralara OTP yağdırma) MVP'de
  en yüksek-yıkıcı saldırı vektörü. TR-only kısıtı bu vektörü tek satırla kapatır.
- **Gevşeme koşulları:** B2B/yurt dışı müşteri ihtiyacı doğarsa generic E.164
  (`^\+[1-9]\d{7,14}$`) kullanılabilir, AMA o noktada şu üç katman ZORUNLU:
  - per-IP + per-phone rate limit (Redis'te)
  - CAPTCHA (Turnstile / hCaptcha) OTP iste endpoint'inde
  - ülke whitelist'i (Türkiye + iş için açılan spesifik ülkeler)

### 8) İsimlendirme

- Tablo: `snake_case` (örn. `refresh_tokens`, `outbox_events`) — Prisma `@@map`.
- Kolon: `snake_case` — Prisma `@map`.
- Prisma model adı: `PascalCase` singular (`User`, `RefreshToken`).
- TS field adı: `camelCase` (`phoneE164`, `tenantId`).

## Consequences

### Pozitif

- Yeni modeller copy-paste edilebilir bir şablona oturur.
- Soft-delete + uniqueness kombinasyonu artık tuzak değil — partial index kuralı net.
- Optimistic lock yalnızca gerektiği yerde → kullanışsız `version` kolonları her tabloyu
  şişirmez.
- Multi-tenant kolon hazır → gerekince mantık eklenir, schema migration'a gerek yok.

### Negatif / Risk

- UUID v4 random → büyük tablolarda B-tree index locality kaybı. v7'ye geçiş şart;
  unutursak Booking tablosu büyüdüğünde insert performansı düşer. **Mitigation:** A2'de
  `uuidv7()` SQL fonksiyonu + migration zorunlu, A2 progress.md'sinde TODO listesinde.
- Prisma soft-delete extension yazılmamışsa direkt `findMany` deleted satırları getirir
  → ciddi data leak riski. **Mitigation:** A2'de extension yazılana kadar tüm `findMany`
  manuel `where: { deletedAt: null }` ile yazılır + lint kuralı (custom
  `no-unfiltered-find`) eklenir.
- Phone TR-only → yurt dışı OTP almak isteyen meşru kullanıcı (örn. yurt dışında oturan
  Türk) ilk MVP'de şutlanır. **Mitigation:** UX'te "şimdilik sadece TR numaralarıyla"
  açık mesaj, B2B feedback'i takip edilecek.

### A2'ye TODO (kayıt için)

- `uuidv7()` Postgres SQL fonksiyonu + migration; tüm tabloların default'unu
  `uuidv7()`'ye geçir.
- Prisma soft-delete ClientExtension (`$extends`).
- `apps/api`'de Idempotency-Key middleware (Redis 24h + Postgres kalıcı).
- Custom ESLint kuralı: `findMany` çağrısında `where.deletedAt` veya `includeDeleted`
  parametresi olmadan kullanım uyarısı.

## Alternatives Considered

- **ULID** — reddedildi: PostgreSQL native fonksiyonu yok, extension gerek; UUID v7 ile
  benzer faydaları sağlıyor, ekosistem (Prisma, frontend libraries) UUID'yi daha iyi
  destekliyor.
- **Hard delete + ayrı archive tablosu** — reddedildi: audit log JOIN'i karmaşıklaşır,
  KVKK DSAR'ı destekliyor olmamız soft delete + targeted hard delete ile zaten karşılanır,
  archive tablo yönetim yükü ekler.
- **Composite unique constraint** (`UNIQUE (phone_e164, deleted_at)`) — reddedildi:
  PostgreSQL'de NULL eşitliği `false` döner, deleted_at NULL olan iki satır arasında
  unique sağlamaz; partial unique index daha temiz ve niyeti net ifade eder.
- **Generic E.164 phone** — reddedildi (MVP için): SMS pumping fraud risk-reward dengesi
  TR-only lehine. Detay: yukarıda bölüm 7.
- **Application-level unique check** (race condition'lı) — reddedildi: distributed insert
  race koşullarında duplicate yaratır; DB constraint tek doğru çözüm.
