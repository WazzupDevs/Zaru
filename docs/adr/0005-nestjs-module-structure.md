# ADR 0005 — NestJS Module Structure (4-Layer per Bounded Context)

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

12 bounded context modüler monolit içinde yan yana yaşayacak. Her modülün aynı iç
yapıyı izlemesi şu üç sebep için kritik:

1. **Muscle memory** — Claude Code ve ileride takım üyeleri her modülde aynı klasör
   ağacını bulsun. "Pricing'de PriceCalculator nerede?" sorusu "always
   `application/`" cevabıyla biter.
2. **Dependency hygiene** — bağımlılık yönü tek istikamette akar, ESLint kuralı bunu
   zorlar (A2b'de). Cross-module sızıntı olmaz.
3. **Mikroservise ayrılma kapısı** — gerektiğinde bir modülü ayrı süreç olarak
   çıkarmak için arayüzler hazır olsun. Domain pure ise taşıması ücretsiz; uygulama
   katmanı port'lar üzerinden konuşuyorsa adapter swap kolay.

CLAUDE.md "Kod Stili" başlığı bu yapıyı zaten belirlemişti; bu ADR somutlaştırır ve
gerekçeleri kayıt altına alır.

## Decision

Her modül `apps/api/src/modules/<name>/` altında **dört katman** içerir. Yeni modül
açan kişi bu klasör ağacını birebir kopyalar:

```
apps/api/src/modules/<name>/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── events/
│   └── errors/
├── application/
│   ├── use-cases/
│   ├── ports/                  # interface tanımları (repository, gateway)
│   └── services/               # cross-use-case orchestration
├── infrastructure/
│   ├── repositories/           # Prisma implementations of ports
│   └── adapters/               # external services (iyzico, Netgsm, Maps, ...)
├── interface/
│   ├── controllers/
│   ├── dto/                    # Zod schemas
│   ├── guards/
│   └── decorators/
└── <name>.module.ts            # NestJS module wiring
```

### Katman sorumlulukları

#### domain/

- **Pure TypeScript.** Framework-agnostik (NestJS, Prisma, ioredis import edilmez).
- **Entity:** kendi invariant'larını korur (örn. `Booking.confirm()` state geçişini
  kendi yapar).
- **Value Object:** identity'siz, değer eşitliği (örn. `Money`, `PhoneE164`).
- **Domain Event:** geçmiş zaman fiil ile (`BookingCreated`, `PaymentAuthorized`).
- **Domain Error:** `DomainError` taban sınıfından türer (`code`, `httpStatus`).
- Bağımlılık sadece stdlib veya pure utility'ler (örn. `zod` schemalar value
  object'lerde olabilir, ama `@nestjs/*` ASLA).

#### application/

- **Use case** = bir kullanıcı niyetinin orkestrasyonu (örn. `RequestOtpUseCase`).
- **Port** = application'ın ihtiyaç duyduğu dış dünya arayüzü (örn. `OtpSenderPort`).
  Interface olarak tanımlanır; infrastructure implement eder. Dependency Inversion.
- **Application service** = birden çok use case ortak orchestration (nadiren).
- Domain'e bağımlı, infrastructure'a **port üzerinden** bağımlı.

#### infrastructure/

- **Repository:** Prisma kullanır, application port'unu implement eder
  (`UserRepository implements UserRepositoryPort`).
- **Adapter:** dış servis çağrısı (iyzico SDK, Netgsm HTTP, Maps API). Application
  port'unu implement eder.
- **Hiçbir use case'i import etmez** — sadece port/interface'i implement eder.

#### interface/

- **Controller:** HTTP endpoint, use case'i çağırır, DTO ↔ domain dönüşümü.
- **DTO:** request/response Zod schema. `ZodValidationPipe` ile bind edilir.
- **Guard / Decorator:** authentication, role check, vb.

### Modül wiring

`<name>.module.ts`:

```ts
@Module({
  imports: [PrismaModule /* başka modüllerin public API'si */],
  controllers: [SomeController],
  providers: [
    // application
    SomeUseCase,
    // infrastructure (port → impl mapping)
    { provide: SOME_PORT, useClass: SomePrismaRepository },
  ],
  exports: [
    // sadece public application service / use case interface'leri
  ],
})
export class SomeModule {}
```

### Dependency rule (zorunlu)

```
interface  →  application  →  domain
                  ↑
infrastructure  ─┘  (implements ports)
```

**Yasak:**

- `domain` → herhangi bir başka katman
- `application` → `infrastructure` (sadece port interface'leri)
- `interface` → `infrastructure` (sadece use case'ler)
- Bir modülün başka modülün `domain/` veya `infrastructure/`'ını import etmesi.
  Cross-module iletişim yalnızca **(a)** domain event veya **(b)** karşı modülün
  `<name>.module.ts`'in export ettiği public application service üzerinden.

ESLint kuralı (`no-restricted-imports`) bu yasakları A2b'de zorlayacak. O zamana
kadar code review.

### Event akışı

1. Use case domain event üretir (örn. `new BookingCreated({ bookingId, ... })`).
2. Use case `PrismaService.$transaction(async tx => { ... await tx.outboxEvent.create({ ... }) })`
   ile aggregate write + outbox write'ı **aynı transaction**'da yapar (ADR 0004).
3. Outbox worker (BullMQ, A2b/A2c) tabloyu drain eder, EventEmitter2 ile in-process
   publish eder.
4. Diğer modüllerin handler'ları event'i `@OnEvent(...)` ile dinler — kendi use
   case'lerini tetikler.

### Naming

- Modül klasörü: kebab-case (`identity`, `billing-compliance`)
- Sınıf: PascalCase (`RequestOtpUseCase`)
- Dosya: kebab-case + sorumluluk suffix'i (`request-otp.use-case.ts`,
  `user.repository.ts`, `booking.controller.ts`)
- Test dosyası: `<name>.spec.ts` (unit) veya `<name>.e2e-spec.ts` (e2e)
- Port interface'i: `<Name>Port` (`UserRepositoryPort`, `OtpSenderPort`); injection
  token UPPER_SNAKE (`USER_REPOSITORY`, `OTP_SENDER`).

## Consequences

### Pozitif

- Yeni modül kararı = template kopyala. Düşünme yükü minimum.
- Bağımlılık yönü tek tip → refaktör güvenli.
- Domain pure → unit test framework-bağımsız (Vitest direct), %80+ coverage hedefi
  ulaşılabilir.
- Mikroservise ayrılma teorik olarak ücretsiz (port'lar zaten ayrım hattı).

### Negatif / Risk

- **Boilerplate:** küçük modüller için 4 katman fazla görünebilir. **Mitigation:**
  CRUD-only modül yok — her modülün gerçek bir domain mantığı var (catalog için bile
  CategoryAttributeDefinition validation kuralları gelecek).
- **Port + adapter ezberi:** yeni gelen developer "neden interface?" sorabilir.
  **Mitigation:** bu ADR + yorumlar.
- **ESLint kuralı yokken disiplin yumuşak:** A2b öncesi cross-layer import
  kazara yapılabilir. **Mitigation:** kod review katmanı + ESLint kural ekleme A2b
  TODO listesinde.

## Alternatives Considered

- **Flat modül (tek klasörde her şey)** — reddedildi: 12 modül × ~10 dosya = çorba;
  refaktör cesaretsizleşir; bağımlılık takip edilemez.
- **Hexagonal architecture full ports-and-adapters (klasik)** — reddedildi: aynı
  mantığın daha ağır versiyonu; ekstra "primary/secondary adapter" terminolojisi
  öğrenme yükü; biz pratik bir alt-küme alıyoruz.
- **Vertical slice (use case başına klasör)** — reddedildi: shared domain entities
  her use case klasörüne kopyalanır veya bağımlılık karmaşası doğar; modüler
  monolitin "modül" tarafı kaybolur.
- **Clean Architecture (Robert C. Martin) tam haliyle** — reddedildi: Entities /
  UseCases / Interface Adapters / Frameworks ayrımı bizim 4 katmanımızla aynı şeyi
  diyor, biz sadece NestJS-friendly isimler kullanıyoruz.
