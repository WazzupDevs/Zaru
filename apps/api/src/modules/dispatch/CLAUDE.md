# Dispatch Module (A4c)

## Sorumluluk

Booking CONFIRMED olduğunda en uygun sürücüyü bul + ata. Driver konum
takibi, online/offline toggle, manuel reassignment.

## Matching Algoritması (deterministic, no ML)

1. **Filter** (PostgreSQL/PostGIS query):
   - Driver APPROVED + isOnline + lastLocationUpdate son 5 dakikada
   - Vehicle ACTIVE + vehicleType match
   - Driver konumu radius içinde (`ST_DWithin` GIST index)
   - VehicleAvailability conflict yok (`tstzrange &&`)
   - Driver başka aktif booking ile çakışma yok
2. **Score** (application layer, pure):
   `score = distanceWeight * (1 - distance/maxRadius) + ratingWeight * (rating/5)`
3. **Sort** score desc, tie-break driverProfileId asc (deterministic).
4. **Atomic assign**: optimistic lock + state transition + availability INSERT
   tek tx içinde.

ADR 0020 — bu kararın gerekçesi + alternatifler.

## Yayılan domain event'leri

- `dispatch.DriverDispatched` — booking'e driver atandı
- `dispatch.DispatchFailed` — match yok (attempts >= max ise
  `requiresManualReview: true`)
- `dispatch.ManualReassignment` — admin override

PII discipline (ADR 0019, A4b A4b establish): payload'larda driver
name, license plate, lat/lng YOK. Sadece id'ler + skor + zaman.

## Public application API

- `AssignDriverToBookingUseCase` — atomic match + assign (worker tetikler)
- `ManualReassignDriverUseCase` (admin) — eski sürücü iptal + yenisi
- `UpdateDriverLocationUseCase` — driver app (A4f) lokasyon update
- `SetDriverOnlineStatusUseCase` — driver app online/offline toggle

## Port'lar

- `DriverSearchRepositoryPort` — PostGIS query abstraction (raw SQL adapter)
- Cross-module injection: `BOOKING_REPOSITORY_PORT` (booking),
  `DRIVER_PROFILE_REPOSITORY_PORT` + `VEHICLE_AVAILABILITY_REPOSITORY_PORT`
  (supply)

## Worker

`BookingDispatchService` + `BookingDispatchWorker` + `BookingDispatchScheduler`
triplet (codebase precedent: BookingExpiry + PriceQuoteCleanup). Tick her
30 saniyede; CONFIRMED + dispatchAttempts < max + lastDispatchAt > cooldown
booking'leri batch alır, sırayla `AssignDriverToBookingUseCase` çağırır.

## Önemli kurallar

- Matching deterministic — aynı input + state → aynı output (no ML).
- PostGIS `geography(Point, 4326)` driver_profiles üzerinde generated column.
- Atomic assignment — race-safe (booking version + availability INSERT
  tek tx).
- Cooldown 60s — worker hemen retry yapmaz.
- DispatchAttempts > max olunca `requiresManualReview: true` event ile
  manual queue'ya.
- Driver lokasyon eskirse (5 dk) matching dışına düşer.
