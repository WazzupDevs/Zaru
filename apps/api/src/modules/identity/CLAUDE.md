# Module: identity

Identity, OTP, JWT, refresh rotation. Customer / Driver / Admin / Support kullanıcıları
ve onların oturum kimlik bilgileri.

## Sorumluluklar

- OTP request + verify (SMS kanalı; A2b'de mock, A2c'de Netgsm)
- JWT access token (15dk) + refresh token rotation (30 gün hashli) — A2c
- Phone-based registration (TR mobile)
- Role assignment (default CUSTOMER, admin tarafından upgrade)

## Yayılan domain event'leri

- `OtpRequested` — yeni OTP request oluştu (A2b)
- `OtpVerified` — OTP doğrulandı (A2c)
- `UserCreated` — yeni kullanıcı kaydı (A2c)
- `UserSessionRotated` — refresh token rotation (A2c)

Tümü transactional outbox'a yazılır (ADR 0004).

## Public application API

Diğer modüller şu use case'leri çağırabilir veya event'leri dinleyebilir:

- `RequestOtpUseCase` (public; idempotency-aware)
- `VerifyOtpUseCase` (A2c)
- `RotateRefreshTokenUseCase` (A2c)

## Port'lar (infrastructure adapter'ları)

- `OtpRequestRepositoryPort` — Prisma implementation
- `SmsSenderPort` — Mock (dev/test) veya Netgsm (A2c)
- `ClockPort` — `SystemClock` (`new Date()`); test'te `FakeClock`

Token konvansiyonu: UPPER_SNAKE injection token + `<Name>Port` interface adı.

## Test hedefleri

- Domain (value objects, entities, events): %100
- Application (use cases): %80+
- Infrastructure (repositories, adapters): %60+ (Testcontainers ile gerçek DB)
- Interface (controller): e2e

Ubiquitous language için `docs/glossary.md` kanonik.
