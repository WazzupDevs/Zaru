# ADR 0019 — Booking State Machine: Custom Hand-Rolled FSM

- **Status:** Accepted
- **Date:** 2026-05-05
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Booking aggregate'i 9 durumlu bir lifecycle yaşıyor:

```
DRAFT → CONFIRMED → DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED
              ↘                ↘                 ↘
        CANCELLED_BY_*    CANCELLED_BY_*       DISPUTED
              ↓
            EXPIRED (DRAFT TTL worker)
```

State değişimleri iş kurallarını ihlal etmemeli:

- `DRAFT → IN_PROGRESS` atlanamaz (önce confirm + driver ata)
- `IN_PROGRESS → CANCELLED_*` yok (event başladı, dispute akışı)
- Terminal state'ler (COMPLETED, CANCELLED\_\*, EXPIRED, DISPUTED) çıkışsız

Yanlış geçiş = müşteri yanlış faturalandırılır, sürücü yanlış atanır, refund hatalı olur. Compile-time veya runtime'da gardiyan ŞART.

## Decision

**Custom hand-rolled state machine.** XState değil.

```ts
const ALLOWED_TRANSITIONS: Record<BookingStatus, ReadonlyArray<BookingStatus>> = {
  DRAFT: ["CONFIRMED", "EXPIRED", "CANCELLED_BY_CUSTOMER"],
  CONFIRMED: ["DRIVER_ASSIGNED", "CANCELLED_BY_CUSTOMER"],
  DRIVER_ASSIGNED: ["IN_PROGRESS", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_DRIVER"],
  IN_PROGRESS: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_DRIVER: [],
  EXPIRED: [],
  DISPUTED: [],
};

export const BookingStateMachine = {
  canTransition(from, to): boolean,
  assertTransition(from, to): void,        // throws InvalidBookingTransitionError
  isTerminal(status): boolean,
  isCancellable(status): boolean,
};
```

Üç seviye gardiyan:

1. **Domain layer** — `BookingStateMachine.assertTransition()` her use case'in sözleşmesi.
2. **Repository layer** — `transitionStatus(tx, { id, fromVersion, toStatus, fields })` atomic optimistic-lock update + status. Yanlış version → `null` → use case `ConcurrentBookingModificationError` fırlatır.
3. **DB layer** — Prisma `BookingStatus` enum, geçerli olmayan değer kabul etmez.

### A4b'nin DRAFT bypass'ı

Şu an `ConfirmBooking` direkt CONFIRMED yaratıyor (DRAFT'ı atlıyor). DRAFT, A4c (payment) gelince devreye girecek: `Confirm → DRAFT → payment authorize → CONFIRMED`. State machine zaten DRAFT → CONFIRMED geçişine izin veriyor; expiry worker DRAFT için hazır. A4c sadece flow'u değiştirecek.

### Cancel state'leri

`CANCELLED_BY_CUSTOMER` ve `CANCELLED_BY_DRIVER` ayrı tutuldu; `CANCELLED_BY_ADMIN` yok. Admin müşteri adına iptal eder (audit trail `cancelledByUserId`'de admin id, event payload'unda `cancelledByRole: "ADMIN"`). State sade kalsın diye 4. cancel state eklenmedi.

## Consequences

### İyi

- **Sıfır dependency** — XState eklemediğimiz için bundle/lockfile küçük kaldı.
- **Tek dosya, görsel tablo** — `ALLOWED_TRANSITIONS` tek bakışta okunur. Yeni state eklemek = enum + tablo + test güncellemesi.
- **Test edilebilir** — 37 unit test pinler (her geçerli + bir avuç geçersiz transition).
- **Identity + Supply pattern'iyle tutarlı** — Onlar da state'leri custom domain logic'le yönetiyor.
- **Optimistic lock entegre** — Transition repo'da `version` ile atomic. Race-safe.

### Maliyet

- **Görsel diagram yok** — XState'in inspector'ı yok. İhtiyaç olunca Mermaid ile tablodan generate edilebilir.
- **Hierarchical state desteği yok** — `IN_PROGRESS.driver_arrived` gibi sub-state ihtiyacı çıkarsa elle compose etmek gerek (veya o noktada XState'e geç).

### Riskler

- **Tabloyu güncellemek vs test güncellemesini unutmak** — Yeni transition eklenirse spec güncellenmezse silent regression. Mitigation: spec her geçişi explicit test ediyor (37 case), eklendiğinde fark hemen görünür.
- **State machine tablosu code review'da düzgün okunmazsa** — A4d'de `IN_PROGRESS → CANCELLED_BY_DRIVER` eklemek gibi karar alındığında PR review checklist'te yer alacak.

## Alternatives Considered

### XState

Reddedildi:

- +1 dependency (~50KB bundle)
- Visual diagram MVP için değil yatırımcı için bile değil — gerçek ihtiyaç A4d sonrası
- Bizim 9 state, 11 transition için overkill — XState'in actor model + hierarchical state özelliklerinden yararlanmıyoruz

### Boolean flag'ler (`isConfirmed`, `isCancelled`, `isCompleted`)

Reddedildi: state ENUM'u dağıttığında invariant ihlali kolaylaşır (`isConfirmed=true && isCancelled=true` mümkün hale gelir). Tek alan + state machine = invariant garantili.

### Implicit state (kolon kombinasyonlarından çıkarılır)

Reddedildi: `if confirmedAt && !cancelledAt && !startedAt && !completedAt → CONFIRMED` gibi formüller her query'de farklı yerde tekrarlanır. Dağıtık state = bug magnet.

### Database trigger ile transition guard

Reddedildi: Domain logic'i SQL'e taşımak test edilebilirliği yok eder. Transition'ı uygulama katmanında tutmak prod parity (testlerde mock DB) ve audit hattı (event source) açısından daha temiz.

## Revisit Trigger

- **12+ state veya hierarchical state ihtiyacı** (örn. `IN_PROGRESS.driver_en_route`, `IN_PROGRESS.event_started`) → XState değerlendirilir.
- **Multi-actor state machines** — birden fazla bağımsız aktörün (dispatcher + driver + customer) eşzamanlı state machine'leri olursa actor model gerek olabilir.
- **Visual diagram ihtiyacı** — Eğer pazarlama/ürün ekibi state diagramını görsel olarak istemeye başlarsa, ya XState inspector ya Mermaid auto-generate.

## References

- Implementation:
  - `apps/api/src/modules/booking/domain/booking-state-machine.ts`
  - `apps/api/src/modules/booking/domain/booking-state-machine.spec.ts` (37 test)
  - `apps/api/src/modules/booking/application/use-cases/cancel-booking.use-case.ts` (asserts via state machine)
  - `apps/api/src/modules/booking/infrastructure/persistence/prisma-booking.repository.ts` (atomic `transitionStatus`)
- Schema: `prisma/schema.prisma` (BookingStatus enum)
- Migration: `prisma/migrations/20260505000000_expand_booking_lifecycle`
- Cross-ref:
  - ADR 0003 (version column convention — optimistic lock)
  - ADR 0017 (immutable price guarantee — booking snapshot)
  - ADR 0014 (ClockPort — TTL determinism in BookingExpiryWorker)
- Env: `BOOKING_DRAFT_TTL_MS` (default 1800000 = 30 min)
