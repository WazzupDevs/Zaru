# ADR 0020 — Dispatch Strategy: Deterministic Weighted Scoring + PostGIS

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Booking CONFIRMED olduğunda en uygun sürücüyü bulup atamak gerekiyor.
Sektörde dört ana yaklaşım:

1. **First-come-first-serve broadcast** (Uber/Lyft erken günleri) — tüm
   uygun sürücülere bildirim, ilk kabul eden alır.
2. **Deterministic weighted scoring** (Lyft Pink, kurumsal taksi
   dispatch) — algoritma en uygun sürücüyü seçer, sürücü kabul/red eder.
3. **Bidding** (eski OnDemand modelleri) — sürücü fiyat teklif eder,
   müşteri seçer.
4. **ML supply-demand prediction** (modern Uber surge + matching) —
   tarihsel veri + gerçek zamanlı sinyallerle dinamik strateji.

Bizim diferansiyasyonumuz: **sabit fiyat, otomatik ödeme, müşteri-sürücü
pazarlığı yok** (CLAUDE.md vizyon, ADR 0017 pricing). Bidding zaten
diskalifiye. Müşteri 5 sürücüye bildirim atıp birini seçmiyor — platform
müşteri adına en uygunu buluyor.

## Decision

**Deterministic weighted scoring with PostgreSQL/PostGIS filtering.**

### Algoritma

1. **Hard filters** (PostGIS + SQL, tek sorgu):
   - Driver `status='APPROVED'` + `is_online=true`
   - `last_location_update` son `DISPATCH_LOCATION_FRESHNESS_SECONDS` (default
     300s = 5 dk) içinde
   - Vehicle `status='ACTIVE'` + `vehicle_type_id` match
   - Driver konumu pickup'dan radius içinde
     (`ST_DWithin(geography, geography, meters)` GIST index'i kullanır)
   - VehicleAvailability conflict yok (`tstzrange &&` half-open overlap)
   - Driver başka aktif booking ile çakışma yok
2. **Soft scoring** (application layer, pure):
   ```
   score = distanceWeight * (1 - distance/maxRadius) + ratingWeight * (rating/5)
   ```
   Default weights `0.7 / 0.3` — yakınlık baskın, rating ikincil.
3. **Sort + tie-break** — score desc; ties → `driverProfileId` asc
   (deterministic, test'lerde aynı input aynı pick).
4. **Atomic assign** — `assignDriver` repo metodu `WHERE status='CONFIRMED'
AND version=fromVersion`; concurrent dispatch → null → throw.
5. **Availability sentinel** — assign sonrası `BOOKED` VehicleAvailability
   INSERT. Aynı tx içinde — paralel dispatch tick'i bu sürücüyü görmez.

### Worker

`BookingDispatchWorker` BullMQ repeat job, `DISPATCH_WORKER_INTERVAL_MS`
(default 30 s) tick. Her tick:

- `findDispatchable` — `status='CONFIRMED' AND attempts<max AND
(lastDispatchAt IS NULL OR lastDispatchAt < now - cooldownMs)` (default
  cooldown 60 s, max attempts 3)
- Her aday için `AssignDriverToBookingUseCase.execute({ bookingId })`
- Counter'ları log'la (attempted/succeeded/failed); exception isolated

### Manual reassign

`ManualReassignDriverUseCase` (admin-only) DRIVER_ASSIGNED'da:

1. Önceki BOOKED availability'i soft-delete
2. `excludeDriverIds: [previous]` ile yeni candidate query
3. `reassignDriver` (status DRIVER_ASSIGNED kalır — state machine'de yeni
   edge yok)
4. Yeni BOOKED availability INSERT
5. `dispatch.ManualReassignment` outbox event (audit)

State machine'i değiştirmedik (ADR 0019 sabit). DRIVER_ASSIGNED →
DRIVER_ASSIGNED bir transition değil, alan değişikliği — repo'nun
güvencesi yeterli.

## Consequences

### İyi

- **Deterministic** — aynı state, aynı input → aynı pick. Test edilebilir,
  debug edilebilir, audit edilebilir. ML değil.
- **PostGIS performansı** — GIST index'i ile <50 ms candidate query (10K
  driver fixture'da bile). MVP için fazlasıyla yeter.
- **Race-safe** — optimistic lock + availability sentinel + WHERE status
  guard. İki paralel dispatch aynı sürücüyü vuramaz.
- **Esnek** — weights, radius, rating threshold, cooldown, max attempts
  hepsi env'den. Operatör deploy zamanında ayarlar; vehicle-type başına
  override hook'u Faz 3 için açık.
- **PII discipline** — outbox event payload'larında driver name, plate,
  lat/lng yok (ADR 0019, A4b establish).
- **Codebase pattern uyumu** — Service+Worker+Scheduler triplet,
  BullMQ repeat job (A4b BookingExpiry + PriceQuoteCleanup precedent).

### Maliyet

- **Sürücü autonomi yok** — algoritma seçer, sürücü kabul/red etmez (A4f
  driver mobile geldiğinde reddetme akışı eklenecek). Şimdi: sürücü
  matched = booking onun.
- **Surge/zone-based matching yok** — uniform scoring; düğün sezonu
  yoğun bölgede bile aynı algoritma. Faz 4'te ML değerlendirilebilir.
- **Manuel review queue UI yok** — `dispatchAttempts >= max` olanlara
  event yayınlanıyor ama admin panel'de görüntüleme A4d/A4e işi.

### Riskler

- **Stale location** — sürücü app crash + 5 dk sonra hâlâ DB'de "online"
  görünür. `last_location_update > now - 5min` filter'ı bunu yakalar
  ama sürücü "yarı-online" olabilir. Driver app heartbeat A4f kapsamı.
- **Availability sentinel race** — assign + availability INSERT tek tx
  içinde, ama tx commit tamamlanmadan başka bir tick çalışırsa ne olur?
  Search query `vehicle_availabilities` tablosuna bakıyor —
  uncommitted row görmez (READ COMMITTED). İkinci tick aynı driver'ı
  bulur, `assignDriver` `WHERE status='CONFIRMED'` ile null döner
  (booking artık DRIVER_ASSIGNED), use case `ConcurrentDispatchError`
  throw eder. Worker fail-isolated → batch devam.
- **maxAttempts=3 thresh too low** — bazı booking'ler çok niche
  (specific vehicle type + remote location); 3 deneme yetmez. Manuel
  review queue UI A4d/A4e sonrasında metric'e göre ayarlanır.

## Alternatives Considered

### FCFS broadcast (sürücüye bildirim, ilk kabul eden alır)

Reddedildi (şimdilik): driver mobile app yok henüz (A4f). Bildirim
gönderecek kanal da yok (A4e notifications). **Revisit trigger:** A4f
driver mobile gelince A/B test (FCFS vs scoring) — driver kabul oranı,
müşteri bekleme süresi metriklerine göre seçim.

### Bidding (sürücü fiyat teklif eder)

Reddedildi: ADR 0017'nin temel kararı "platform-controlled pricing".
Bidding bu modeli yıkar, müşteri-sürücü pazarlığı kapısını açar.
**Revisit:** YOK — diferansiyasyonumuzun parçası.

### ML supply-demand matching

Faz 4+'a ertelendi: sıfır tarihsel veri var. MVP için overkill,
deterministic scoring şeffaflık + test edilebilirlik açısından daha
iyi. **Revisit trigger:** 10K+ tamamlanmış booking, çeşitli sezon

- lokasyon dağılımı.

### Alternative: matching adapter port (mock + production swap)

Reddedildi: Pricing'deki DistanceCalculator factory pattern PostGIS
için gerekmedi. Tek SQL query, lokal Postgres her zaman var (CI dahil).
Faz 4'te ML adapter eklemek istersek Port soyutlamasını o zaman ekleriz.

## Revisit Trigger

- **100+ aktif sürücü** olunca FCFS broadcast vs scoring A/B test.
- **Bölgesel arz/talep dengesizliği** ölçüldüğünde zone-based scoring
  (yaz sezonu Bodrum'da `maxRadiusKm` daralır vs).
- **10K+ booking + 6 ay tarihsel veri** → ML matching POC.
- **Driver kabul oranı < %80** scoring'in seçtiği sürücülerden — push
  pattern (FCFS broadcast) değerlendir.

## References

- Implementation:
  - `apps/api/src/modules/dispatch/domain/services/driver-matcher.service.ts`
  - `apps/api/src/modules/dispatch/domain/services/dispatch-policy.service.ts`
  - `apps/api/src/modules/dispatch/infrastructure/persistence/prisma-driver-search.repository.ts`
  - `apps/api/src/modules/dispatch/application/use-cases/assign-driver-to-booking.use-case.ts`
  - `apps/api/src/modules/dispatch/application/use-cases/manual-reassign-driver.use-case.ts`
  - `apps/api/src/modules/dispatch/infrastructure/workers/booking-dispatch.{service,worker,scheduler}.ts`
- Schema: `prisma/schema.prisma` (`DriverProfile.lastKnown*`,
  `Booking.dispatchAttempts/lastDispatchAt/dispatchFailedReason`)
- Migration: `prisma/migrations/20260507000000_add_dispatch_metadata`
  (PostGIS generated geography column + GIST index)
- Cross-ref:
  - ADR 0014 (ClockPort)
  - ADR 0017 (Pricing — platform-controlled, bidding kapısı kapalı)
  - ADR 0018 (External API Integration — bu kararda PostGIS lokal,
    pattern uygulanmadı)
  - ADR 0019 (Booking State Machine — CONFIRMED → DRIVER_ASSIGNED edge'i
    kullanır)
- Env: `DISPATCH_MAX_RADIUS_KM`, `DISPATCH_MIN_RATING`,
  `DISPATCH_DISTANCE_WEIGHT`, `DISPATCH_RATING_WEIGHT`,
  `DISPATCH_MAX_ATTEMPTS`, `DISPATCH_RETRY_COOLDOWN_MS`,
  `DISPATCH_WORKER_INTERVAL_MS`, `DISPATCH_LOCATION_FRESHNESS_SECONDS`
