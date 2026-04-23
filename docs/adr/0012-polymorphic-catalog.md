# ADR 0012 — Polymorphic Catalog Model

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

CLAUDE.md Vizyon: Faz 4'te yeni vertical'lar (oto kurtarıcı, vale, kurumsal
servis hattı). Faz 1'de düğün arabası tek vertical. **Sorun:** her yeni
vertical için `wedding_cars`, `tow_trucks`, `valet_jobs` ayrı tablolar +
ayrı use case + ayrı endpoint çorbası mı yapacağız?

Booking, dispatch, pricing modülleri "Vehicle"a bağlanacak. Her vertical
için ayrı kod yolu = N × kod tekrarı + tutarsızlık riski + N booking flow
varyantı. Kabul edilemez.

## Decision

**Tek `Vehicle` tablosu + tek `Booking` tablosu + polimorfik attribute'lar
JSONB.** Yeni vertical eklemek = SQL insert (1 kategori + N attribute def +
M vehicle type), 0 kod değişikliği.

### Üç tabloluk yapı

```
ServiceCategory ────< VehicleType ──── Vehicle (A3b)
       │
       └─< CategoryAttributeDefinition (key, dataType, scope, validation)
                          │
                          └─ runtime Zod schema → validates Vehicle.attributes (JSONB)
                                              ve Booking.attributes (JSONB)
```

- **`ServiceCategory`** — vertical kayıt. Slug ile tanımlı (`wedding-car`,
  `tow-truck`, `valet`). `type` alanı (`PLANNED_EVENT` /
  `ON_DEMAND_DISPATCH` / `SCHEDULED_TRANSPORT`) booking flow'unun hangi
  pattern'i takip edeceğini söyler — 3 sınıf var, sonsuz değil.
- **`VehicleType`** — kategori başına araç sınıfı (`classic-sedan`,
  `vip-sedan`, `tow-truck-flatbed`). Capacity range bunda.
- **`CategoryAttributeDefinition`** — kategori başına attribute kontratı.
  - `dataType: STRING | NUMBER | BOOLEAN | ENUM | DATE`
  - `scope: VEHICLE | BOOKING` (attribute araç bazlı mı, kiralama bazlı mı)
  - `enumOptions` (ENUM için), `validationRules` (NUMBER min/max gibi)
  - `isRequired` (zorunlu mu)
- **`Vehicle.attributes JSONB`** — `{trim_color: "white", has_air_conditioning: true}`
  şeklinde. Runtime'da CategoryAttributeDefinition'lardan dinamik üretilen
  Zod schema ile validate edilir (A3b'de `RegisterVehicleUseCase`).
- **`Booking.attributes JSONB`** (A4) — `{ceremony_venue: "Çırağan",
rental_hours: 6}`. Aynı pattern.

### Type safety trade-off

Vehicle.attributes bir `JsonValue` — TypeScript compile time'da içerikten
habersiz. Runtime'da Zod schema attribute defs'ten üretilir, validate
edilir. **Compile-time type safety kayıp, runtime safety korunur.** Yeni
vertical için kod değişikliği gerekmediği için kazanç çok daha büyük.

A4+ alternatif: TypeScript `infer`-able dynamic schema generator (zod-to-ts
veya benzeri) — frontend'de form schema da aynı kaynaktan üretilir.

### Migration / extension

Yeni vertical eklemek (örn. tow-truck):

1. SQL: `INSERT INTO service_categories (slug, name, type, ...) VALUES ('tow-truck', 'Oto Kurtarıcı', 'ON_DEMAND_DISPATCH', ...)`.
2. SQL: 3-5 `vehicle_types` (`flatbed`, `wheel-lift`, `motorcycle-tow`).
3. SQL: 5-10 `category_attribute_definitions` (`towing_capacity_kg`,
   `incident_location`, vs).
4. **Kod**: 0 satır. Mevcut `RegisterVehicleUseCase`, `ListCategories`,
   booking flow yeni vertical'i otomatik handle eder — type=ON_DEMAND_DISPATCH
   booking flow varyantı dispatch modülünde zaten var olacak (A4).

Admin panel A3c+ "yeni kategori yarat" formuyla kullanıcı arayüzünden
yapılabilir hale gelecek; o zamana dek SQL veya seed script.

## Consequences

### İyi

- **Sıfır kod yeni vertical**, vizyon karşılanıyor.
- **Tek Vehicle / Booking tablosu** → reporting, dispatch, pricing tek
  source-of-truth ile çalışır. Cross-vertical analytics doğal.
- **Test yüzeyi sabit** — aynı use case suite'i her vertical için geçerli.

### Maliyet / kabul edilen trade-off

- **JSONB validation runtime'da** — compile-time type safety yok. Mitigation:
  CategoryAttributeDefinition'lardan dinamik Zod schema üretimi, RegisterVehicle
  - Booking create yollarında validate. Test'te attribute combinations.
- **Polimorfik query kompleks** — "tüm beyaz süslemeli sedan'lar" sorgusu
  JSONB operator (`@>` / `?`) gerektirir. Postgres GIN index `attributes`
  kolonunda — A4'te dispatch matching kullanacak.
- **Frontend dinamik form** — admin/customer app'te CategoryAttributeDefinition
  fetch edip form schema üretmek lazım. shadcn-form için extra glue. A4
  scope.

### Riskler

- **Attribute schema migration:** mevcut Vehicle satırları olan bir kategoride
  yeni `isRequired=true` attribute eklemek geçmiş satırları "invalid" yapar.
  **Çözüm:** isRequired sadece yeni kayıtlarda enforce; eski satırlar
  "data drift" tolere edilir veya backfill migration. Pattern A3b
  RegisterVehicleUseCase'de açıklanır.
- **EAV anti-pattern endişesi:** klasik EAV (entity-attribute-value)
  Postgres'te problematik (N joinli sorgu). JSONB kullanmamız bu
  endişeyi kapatır — JSONB tek kolon, GIN index'le sorgulanabilir.

## Alternatives Considered

### Per-category table (`wedding_cars`, `tow_trucks`)

3 vertical × ortalama 3 tablo (vehicle, booking, attribute) = 9 tablo
redundancy. Cross-vertical sorgular UNION ALL spaghetti. **Red.**

### EAV (Entity-Attribute-Value) klasik

`vehicles` + `vehicle_attribute_values (vehicle_id, attribute_def_id, value)`.
Sorgu `JOIN`'siz olmaz. Postgres JSONB zaten EAV semantik + indexable
**tek kolon**. **Red — JSONB üstün versiyon.**

### Single-table inheritance (Rails STI tarzı)

Tek tablo, `type` discriminator, type-specific kolonlar `nullable`. Tablo
şişer (her vertical kolon ekler), null cluster, type-safe değil.
**Red.**

### Discriminated union / sealed class hiyerarşi

TypeScript'de `Vehicle = WeddingCar | TowTruck | ValetJob` discriminated
union. **Red:** TypeScript-only, DB tarafında karşılığı yok. Yeni vertical
= TypeScript kod değişikliği — vizyona aykırı.

## Revisit Triggers

- **Cross-vertical attribute sorgu performansı** — JSONB GIN index'i
  yeterli olmazsa attribute defs'i ayrı kolonlara materialize eden
  view ekle.
- **Schema-level type safety çok kritik olursa** — zod-to-typescript
  codegen ile compile-time inferred types üretebiliriz, ama bu manual
  generation step ekler.
- **Faz 4'te 5+ vertical** olunca: gerçek dünya tutarlılık veri analizi
  yap, ADR güncelle.

## References

- Implementation: `apps/api/src/modules/catalog/`
- Schema: `prisma/schema.prisma` — `ServiceCategory`, `VehicleType`,
  `CategoryAttributeDefinition`
- Seed: `prisma/seed.ts` (wedding-car kategorisi referans implementasyonu)
- Module CLAUDE.md: `apps/api/src/modules/catalog/CLAUDE.md`
