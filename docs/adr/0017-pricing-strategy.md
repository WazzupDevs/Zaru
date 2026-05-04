# ADR 0017 — Pricing Strategy: Platform-Controlled Deterministic Dynamic

- **Status:** Accepted
- **Date:** 2026-04-27
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

Marketplace fiyatlandırma stratejisini A4a'da donduruyoruz çünkü Pricing
modülü, Booking + Payment + Dispatch'in bağımlı olduğu giriş kapısı. 3 ana
sektör pratiği var:

1. **Driver-controlled** (Uber/Lyft sürge fiyat, esnaf kendi fiyat) — sürücü
   günün havasına göre fiyat verir, müşteri AB modeli görür.
2. **Host-controlled** (Airbnb) — supply tarafı (sürücü) fiyat seçer, platform
   önerir ama bağlayıcı değil.
3. **Platform-controlled** (Lyft Pink, kurumsal taksi tarifesi) — platform
   formülle hesaplar, sürücü ve müşteri fiyatla pazarlık etmez.

Türkiye düğün sektöründe (`wedding-car`) gerçek dünya pratiği bugün:
WhatsApp'ta sürücüyle pazarlık + nakit ödeme. Bizim diferansiyasyonumuz tam
zıttı: sabit, şeffaf, otomatik ödeme. Bu konum müşteri güveni + operasyonel
sadelik sağlıyor (CLAUDE.md "Vizyon" maddesi).

## Decision

**Platform-controlled deterministic dynamic pricing.**

### Veri modeli (ADR 0003 + bu ADR)

- `PricingProfile` — vehicle type başına bir tane. baseFee + perKmFee +
  perHourFee + minimumHours + includedKm. **Decimal(10, 2)** her para alanında.
- `PricingRule` — 3 tip:
  - `SEASONAL_MULTIPLIER` (validFrom..validTo + multiplier)
  - `DAY_OF_WEEK_MULTIPLIER` (daysOfWeek bitmask + multiplier)
  - `ADDON` (fixedAmount, isOptional flag, müşteri seçer)
- `PriceQuote` — hesap snapshot'ı (breakdown JSONB), TTL'li (`PRICE_QUOTE_TTL_SECONDS`,
  default 900s = 15 dk), `ACTIVE → CONSUMED → EXPIRED`.

### Hesaplama akışı (PricingCalculator)

```
1. baseFee
2. + distanceFee = max(0, distanceKm - includedKm) × perKmFee
3. + hourlyFee = max(minimumHours, durationHours) × perHourFee
4. = subtotal
5. multiplier'lar compound (sıra önemsiz, çarpma commutative)
6. + addons (multiplier'lardan SONRA, fixed amount)
7. = totalAmount
```

`Decimal.js` HER YERDE, JS `number` para hesabında **yasak**. Multiply
sonuçları `HALF_UP` yuvarlanır. Test'ler `5500 × 1.30 = 7150.00` gibi
deterministik sınırları pinler.

### Quote yaşam döngüsü

- 15 dk TTL — müşteri form doldurup onaylama arasında geçen makul süre.
- Quote oluştururken outbox'a `pricing.PriceQuoteCreated` event yazılır
  (analytics + retention pipeline için, A4 sonrası).
- Booking modülü A4b'de quote'u atomik olarak `CONSUMED`'a çeker
  (`PriceQuoteRepository.consumeQuote`, `updateMany WHERE status=ACTIVE AND
expiresAt>now`). EXPIRED quote consume edilemez.
- Cleanup worker A4b'de `PriceQuoteExpired` üretip status'ü EXPIRED'a alır
  (mevcut OutboxDrainService pattern'i).

### Rule snapshot

Quote `breakdown` JSONB alanı, hesaplama anındaki rule isim + multiplier +
addon listesini saklar. Admin sonradan kuralı değiştirse veya silse bile
quote sabit kalır — müşteri gördüğü fiyatı ödeyeceğine güvenir. Bu
**immutable price guarantee**, Booking'in confirm aşamasında re-calculate
yerine quote'tan total alır.

### External: Mesafe hesaplama

`DistanceCalculatorPort` (ADR 0018) — Google Maps Distance Matrix prod'da,
mock haversine dev/test'te. External call **transaction'dan ÖNCE** çalışır;
DB lock'ları 5 saniyelik HTTP'ye katlanmaz (ADR 0010 disipline).

### Rate limit + idempotency

- `POST /pricing/quotes` user başına dakikada 10 (Redis sliding window, mevcut
  altyapı). Form double-tap için `Idempotency-Key` opsiyonel ama desteklenir.
- Admin `PUT/POST/PATCH` endpoint'leri idempotency-key zorunlu (admin UI
  retry korumas için).

## Consequences

### İyi

- **Şeffaflık** — müşteri breakdown görür, "neden bu fiyat" sorusu açıktır
  (yaz zammı + hafta sonu + süs).
- **Operasyonel sadelik** — DM pazarlık yok, müşteri/şoför etkileşimi
  fiyat üstünde değil hizmet üstünde.
- **Pazarda diferansiyasyon** — rakipler manuel; biz tek tıkla kesin fiyat.
- **Test edilebilir** — Decimal precision testleri (`× 1.30`, compound
  `× 1.30 × 1.15`) sözleşme kanıtı. Calculator pure function.
- **Audit edilebilir** — quote breakdown immutable, dispute durumunda
  belge.

### Maliyet

- **Admin ezberinde** — yeni vertical (oto kurtarıcı, vale) için profile +
  rule'lar manuel girilecek. ML dinamik fiyat (Faz 4+) bu maliyeti azaltır.
- **Sürücü esnekliği yok** — düşük talep günü sürücü fiyatı düşüremez.
  Diferansiyasyonumuzun bedeli; revisit trigger'a bağlandı.
- **Quote storage growth** — her başarısız form denemesi de quote yazıyor.
  15 dk sonra cleanup ama tablo şişer. Aylık 10K quote = 120K satır/yıl,
  Postgres için sorun değil; metric eklenecek.

### Riskler

- **Yanlış multiplier admin girişi** — admin paneli 2.30 yerine 23.0 yazarsa
  müşteri 30× pahalı quote görür. Mitigation: validation `Decimal(4, 2)` +
  sanity check (multiplier 0.5–3.0 dışı warning, A4b'de admin UI'da).
- **Rule overlap** — yaz multiplier + hafta sonu multiplier compound = 1.495.
  Üç rule birden uygulanırsa 1.30 × 1.15 × 1.20 = 1.794 (%79 zam). Test
  pinler ama admin "yanlış kombinasyon" yazabilir. A4b runbook'ta
  "rule combination preview" admin UI önerisi.

## Alternatives Considered

### Driver-controlled (Uber/Lyft surge)

Reddedildi: shopping deneyimi kötü (müşteri 5 sürücü fiyatı kıyaslar),
race-to-bottom (sürücü fiyatı düşürür, kalite düşer), pazarlık tetikleyicisi
(ADR'ın temel hedefine ters).

### Tamamen statik fiyat

Reddedildi: yaz sezonu (Mayıs-Eylül) talep 3-4 katına çıkıyor. Sabit fiyat
ya altta yetersiz kapasite ya kışın aşırı pahalı. Sezonsalite gerçeği yok
sayılamaz.

### ML dinamik fiyat (XGBoost / supply-demand model)

Faz 4+'a ertelendi. MVP için aşırı; veri yok (sıfır booking), feature
engineering overhead. Faz 4'te 3-6 ay tarihsel veri biriktiğinde
düşünülecek.

### Quote TTL sonsuz (snapshot her zaman geçerli)

Reddedildi: pazarlık gibi davranır (müşteri "dün aldığım fiyatı bugün
de geçerli kabul et" tartışması). 15 dk standart e-ticaret.

## Revisit Trigger

- **100+ aktif sürücü** olunca driver-controlled pricing tartışılır
  (rekabet baskısı + sürücü autonomi talebi). Şu an 0 sürücü, kontrol
  platformda.
- **Rakip platform launch** olursa fiyat esnekliği reaktif gerek.
- **ML için yeterli veri** (10K+ tamamlanmış booking, çeşitli sezon/lokasyon).

## References

- Implementation:
  - `apps/api/src/modules/pricing/domain/services/pricing-calculator.service.ts`
  - `apps/api/src/modules/pricing/domain/services/rule-evaluator.service.ts`
  - `apps/api/src/modules/pricing/application/use-cases/request-price-quote.use-case.ts`
  - `apps/api/src/modules/pricing/application/use-cases/get-quote.use-case.ts`
- Schema: `prisma/schema.prisma` (PricingProfile / PricingRule / PriceQuote)
- Migration: `prisma/migrations/20260427000000_add_pricing_and_booking`
- Cross-ref:
  - ADR 0003 (Decimal money, version, soft-delete conventions)
  - ADR 0010 (External call outside transaction)
  - ADR 0014 (ClockPort — TTL deterministic in tests)
  - ADR 0018 (DistanceCalculator port + adapter + mock)
- Env: `PRICE_QUOTE_TTL_SECONDS` (default 900 = 15 dk)
