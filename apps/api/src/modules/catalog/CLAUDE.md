# Module: catalog

Polymorphic vertical model. Defines **what can be rented** in a way that scales
to new verticals (oto kurtarıcı, vale, kurumsal servis) by inserting rows, not
by writing code. See ADR 0012.

## Sorumluluklar

- ServiceCategory (vertical: wedding, tow, valet, ...)
- VehicleType (per-category vehicle classes)
- CategoryAttributeDefinition (polymorphic attributes — VEHICLE or BOOKING scope)
- Public read endpoints (customer app reads catalog without auth)

Write paths (admin: create category, add vehicle type, add attribute def) are
A3b/A3c scope — endpoints absent on purpose; admin panel will use direct
Prisma calls or a separate `/admin/catalog/**` set later.

## Yayılan domain event'leri (A3b+)

Yok şu an — read-only modül. Write paths gelince:

- `catalog.CategoryCreated`
- `catalog.VehicleTypeAdded`
- `catalog.AttributeDefinitionAdded`

## Public application API

- `ListCategoriesUseCase` — active, sortOrder ASC.
- `GetCategoryUseCase` — slug bazlı detay (vehicle types + attribute defs nested).
- `ListVehicleTypesUseCase` — kategori slug'una göre vehicle types.

## Port'lar

- `ServiceCategoryRepositoryPort` — Prisma impl.

## Polimorfik attribute kontratı

`CategoryAttributeDefinition.dataType + scope` runtime şema üretimi için temel:

- **scope=VEHICLE**: tanım `Vehicle.attributes` JSONB'sine girer (renk, klima
  var mı vs).
- **scope=BOOKING**: tanım `Booking.attributes` JSONB'sine girer (kaç saat
  kullanılacak, tören yeri vs — A4'te booking modülü).

A3b'deki `RegisterVehicleUseCase` bu tanımları çekip Zod schema dinamik üretir
ve attribute payload'unu validate eder.

## Test hedefleri

- Domain (SlugVO): %100
- Application (use cases): mock repo ile
- Infrastructure (Prisma repo): Testcontainers ile gerçek DB
- Interface (controller): integration spec — seed sonrası endpoint shape
