# ADR 0006 — UUID v7 Adoption (New Tables Only)

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)
- **Supersedes (partially):** ADR 0003 §1 ("UUID v4 başlangıçta, A2'de v7'ye geçilecek")

## Context

ADR 0003 §1'de "üretim verisi sıfır olduğu için v4 ile başlıyoruz, A2'de v7'ye
geçeceğiz" taahhüdü vardı. Şimdi A2b'de bunu yerine getiriyoruz, ama tek bir
nüansla: **mevcut 3 tabloyu (`users`, `refresh_tokens`, `outbox_events`) GÖÇ
ETTİRMİYORUZ.** Sadece `uuidv7()` fonksiyonunu ekliyoruz; bundan sonraki
**yeni** tablolar onu default olarak kullanacak.

### Neden v7?

- Postgres B-tree primary key index'leri zaman-sıralı insert'lerde locality
  kazanır: yeni satırlar hep ağacın aynı dalına düşer, "page split" minimum,
  cache hit oranı yüksek.
- v4 random ID'ler her insert için farklı sayfaya iner → "write amplification",
  buffer pool kirlenmesi, ileriki büyük tablolarda (`bookings`, `payments`)
  fark hissedilir.
- v7 standart (RFC 9562 / draft-peabody-04). PostgreSQL 17+ native fonksiyon
  getirecek; biz şimdilik plpgsql ile manuel uyguluyoruz.
- ULID'in zaman-sıralı avantajını sağlar AMA Prisma'nın `@db.Uuid` tipiyle ve
  ekosistemin (mobil, frontend, log aggregator, GUID-aware araçlar)
  yerleşik UUID desteğiyle uyumlu kalır.

### Neden retrofit yok?

- Mevcut PK değerlerini değiştirmek FK referanslarını kıracak ve audit
  history ile çelişecek.
- Mevcut 3 tablo henüz prod data tutmuyor, ama ileride v7'ye "convert"
  edebileceğimiz illüzyonu zarar — gerçekte primary key'i değiştirmek tüm
  child rows'u rewrite etmek demek.
- Karışık ID uzayı debug açısından **fayda** sağlar: bir ID görüldüğünde "bu
  eski tabloya mı yeni tabloya mı?" ayırt edilebilir (v4: 4. grup ilk hane
  `4`; v7: `7`).

## Decision

### 1) `uuidv7()` SQL fonksiyonu eklendi

Migration: `prisma/migrations/20260422233945_add_uuidv7/migration.sql`

```sql
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$ ... $$;
```

İmplementasyon plpgsql; `extract(epoch FROM clock_timestamp()) * 1000` ile
millisecond timestamp + `gen_random_bytes(10)` rastgelelik + version/variant
byte'larının doğru bit pattern'ı.

### 2) Mevcut 3 tablo (`users`, `refresh_tokens`, `outbox_events`)

`@default(dbgenerated("gen_random_uuid()"))` ile **kalır.** Migration **YOK**.

### 3) Bundan sonraki tüm yeni tablolar

```prisma
id String @id @default(dbgenerated("uuidv7()")) @db.Uuid
```

A2b'de eklenen ilk böyle tablo: `otp_requests` (Görev 5'te).
İlerideki: `bookings`, `payments`, `wallets`, `idempotency_records` (string PK
olduğu için bu hariç), her şey.

### 4) PostgreSQL 17+ migration planı (gelecek)

PG 17 GA'dan sonra (2024 sonbaharında çıktı; biz şu anda PG 16'dayız) native
`uuidv7()` fonksiyonu olacak. Geçtiğimizde:

- Bizim plpgsql fonksiyonumuzu DROP et, `dbgenerated`'da aynı isim native'i
  çağırır (signature aynı).
- Yeni ADR ile kayıt al.

## Consequences

### Pozitif

- Yeni tablolar için B-tree locality optimal.
- Bundan sonraki tüm domain entity ID'leri zaman-sıralı → log/trace
  korelasyonunda da insert sırasıyla gözlemleyebiliyoruz.
- ADR 0003 taahhüdü yerine getirildi.

### Negatif / Risk

- **Heterojen ID uzayı.** 3 eski tablo v4, gerisi v7. Debug'da ufak bir
  bilişsel yük; mitigation olarak development-notes.md'de hatırlatma var.
- **plpgsql fonksiyon performansı C native'ten yavaş** (mikrosaniye farkı,
  ihmal edilebilir; PG 17'ye geçince çözülür).
- **clock_timestamp() vs now() farkı.** Fonksiyon `clock_timestamp()` (real
  time, transaction-bağımsız) kullanıyor; aynı transaction'da çağrılan iki
  uuidv7() **farklı** zaman damgaları üretir. Bu beklenen davranış (yoksa ID
  collision riski).

## Alternatives Considered

- **ULID** — reddedildi (ADR 0003'teki gerekçe geçerli): Postgres native tip
  yok, extension gerek; UUID v7 aynı time-ordered avantajı UUID
  ekosistemiyle sağlıyor.
- **Tüm tabloları v7'ye retrofit** — reddedildi: PK değiştirme = FK rewrite,
  audit kırılır; ID karışıklığı bilgi sağlar, zarar değil.
- **gen_random_uuid() (v4) ile devam etme** — reddedildi: ADR 0003'te
  "geçeceğiz" dedik, taahhüt borcu; index locality kaybı büyük tablolarda
  somut.
- **`pg_uuidv7` extension (3rd-party)** — reddedildi: ek extension yönetimi
  - Hetzner/Coolify deployment'ında ekstra step. plpgsql tek dosya, taşınır.
