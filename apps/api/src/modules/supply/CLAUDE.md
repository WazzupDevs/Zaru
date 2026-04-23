# Module: supply

Sürücü onboarding, araç register, evrak yükleme ve admin onay akışı.

## Sorumluluklar

- DriverProfile (CUSTOMER → DRAFT → DOCUMENTS_PENDING → APPROVED / REJECTED)
- Vehicle (per-driver, polymorphic attributes per CategoryAttributeDefinition)
- Document (per-driver, optional per-vehicle; presigned upload + admin review)
- Admin queue (`/admin/supply/**`) — list pending, approve, reject, review document.

## Yayılan domain event'leri

- `supply.DriverProfileCreated`
- `supply.DriverSubmittedForReview`
- `supply.DriverApproved`
- `supply.DriverRejected`
- `supply.VehicleRegistered`
- `supply.DocumentUploaded`
- `supply.DocumentReviewed`

Tümü transactional outbox'a yazılır (ADR 0004). Payload'larda **PII (TCKN, IBAN)
plaintext YOK** — yalnızca id'ler, isim, ibanLast4 (display için).

## Public application API

- `CreateDriverProfileUseCase` — auth'lu user (CUSTOMER) profil yaratır.
- `UpdateDriverProfileUseCase` — yalnızca DRAFT'ta çalışır.
- `GetMyDriverProfileUseCase`
- `SubmitForReviewUseCase` — gerekli evrak (REQUIRED_DOCUMENT_TYPES) yüklenmiş olmalı.
- `ApproveDriverUseCase` (admin) — User.role'ü DRIVER'a promote eder (aynı tx).
- `RejectDriverUseCase` (admin) — rejectionReason zorunlu.
- `ListPendingDriversUseCase` (admin) — DOCUMENTS_PENDING queue, cursor paginated.
- Vehicle: `RegisterVehicleUseCase`, `UpdateVehicleAttributesUseCase`, `ListMyVehiclesUseCase`.
- Document: `RequestDocumentUploadUseCase`, `ConfirmDocumentUploadUseCase`,
  `ReviewDocumentUseCase`, `ListMyDocumentsUseCase`.

## PII disiplini (kritik)

- **DB:** `nationalIdHash` (HMAC-SHA256), `ibanHash` (argon2id), `ibanLast4` (plain).
  Plaintext TCKN/IBAN ASLA kolon değil.
- **Event payload:** TCKN/IBAN/hash YOK. Subscribers ihtiyaç duymamalı.
- **Response DTO:** `ibanLast4` evet, hash hayır, plaintext hayır.
- **Log:** pino redaction `*.nationalId`, `*.iban`, `*.nationalIdHash`, `*.ibanHash`
  (logger.config.ts).
- **Tests:** integration test'leri DB'de `WHERE national_id_hash = HMAC(input)` ile
  arar, plaintext kontrolü için `expect(JSON.stringify(response)).not.toContain(tckn)`
  smoke check ekler.

ADR 0016 — bu kuralın gerekçesi.

## Cross-module write: User.role promotion

`ApproveDriverUseCase` aynı tx'te `tx.user.update` ile role'ü `DRIVER`'a çeker.
Identity'nin tablo şemasına dokunduğumuz için ADR 0005 katı yorumuyla uyumsuz
gibi görünür ama kasıtlı: event-driven role promotion "approved ama henüz
promote edilmedi" pencerisi yaratır. Aynı tx → atomik. Bu istisna kalsın.

## Port'lar

- `DriverProfileRepositoryPort`
- `VehicleRepositoryPort`
- `DocumentRepositoryPort`
- `StoragePort` (common, presigned upload için)
- `PiiHasher` (common, security)
- `TxRunnerPort`, `OutboxWriterPort`, `ClockPort` (hepsi common)

## Test hedefleri

- Domain VOs (NationalId, IBAN, Plate): %100, checksum + format coverage.
- Application use cases: mock ports ile happy path + 2-3 error path.
- Infrastructure (Prisma repos): Testcontainers ile gerçek DB.
- Interface (controllers + admin): full e2e (register → submit → approve → role check).
