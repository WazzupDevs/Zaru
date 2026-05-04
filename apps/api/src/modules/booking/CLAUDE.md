# Booking Module (A4a Skeleton)

## Sorumluluk

Müşteri rezervasyonu — Quote → Booking dönüşümü. Faz 2'nin merkezi modülü.

## A4a kapsamı

- `BookingEntity` — minimum şekil (customerId, priceQuoteId, status DRAFT)
- `BookingRepositoryPort` + Prisma impl: `create`, `findById`
- Pricing modülü `PriceQuoteRepositoryPort.consumeQuote` ile bu modül A4b'de
  bir araya gelecek (CreateBookingFromQuote use case)

## A4b'de gelecekler

- State machine: DRAFT → CONFIRMED → DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED
- İptal: CANCELLED_BY_CUSTOMER / CANCELLED_BY_DRIVER / REFUNDED
- Use case'ler: `CreateBookingFromQuote`, `ConfirmBooking`, `CancelBooking`, vb.
- Driver assignment (dispatch entegrasyonu)
- Outbox: `booking.BookingCreated`, `BookingConfirmed`, `BookingCancelled`, …

## Kurallar (önden yazılı)

- PriceQuote consume edilince geri alınamaz (atomic ACTIVE → CONSUMED).
- Booking aggregate'inde optimistic lock (`version` kolonu zaten schema'da).
- State transition'ları XState ile. ADR'ı A4b'de.
