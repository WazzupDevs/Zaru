# ADR 0018 — External API Integration Pattern (Port + Adapter + Mock)

- **Status:** Accepted
- **Date:** 2026-04-27
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

A4a'da Pricing modülü Google Maps Distance Matrix API'sine bağımlı. Faz 2'nin
geri kalanında daha çok external dependency geliyor:

- **iyzico** (A4c) — provizyon/capture/iade/payout
- **Netgsm + İleti Merkezi** (A4f) — SMS
- **Paraşüt** (Faz 3) — e-fatura
- **Sentry / Grafana / Better Stack** (Faz 4) — observability

İki problem her birinde tekrar etti:

1. **Test'lerde gerçek API çağrısı yapılamaz** — rate limit, ücret, flakiness,
   credit card / üye işyeri sandbox akışı.
2. **Dev'de gerçek key her zaman elde değil** — yeni katılan geliştirici
   sıfırdan key alıp `.env`'e koymadan API çağrısı bile yapamasın istemiyoruz.

ADR 0014 (ClockPort) ve ADR 0009 (RateLimiterPort) ile aynı sorunu çözmüştük
ama bunlar internal abstraction'lardı. External HTTP API'lar için kuralı
bir kez yazıp her sefer aynı pattern'i uygulamak gerek.

## Decision

**Her external integration için 4 parça:**

1. **Domain port** — `application/ports/<thing>.port.ts`. Symbol token + arayüz.
2. **Production adapter** — `infrastructure/<thing>/<vendor>-<thing>.ts`.
   HTTP client (axios), env'den credential, vendor error → `DomainError`.
3. **Mock/Test adapter** — `infrastructure/<thing>/mock-<thing>.ts`.
   Deterministic, network'siz, hiçbir external dep'siz.
4. **Module factory** — `<module>.module.ts` içinde `useFactory` ile env'e göre seçim:

```typescript
{
  provide: DISTANCE_CALCULATOR_PORT,
  useFactory: (config: ConfigService<Env, true>, ...) => {
    const apiKey = config.get("GOOGLE_MAPS_API_KEY", { infer: true });
    if (apiKey.startsWith("AIzaSy_DUMMY")) return new MockDistanceCalculator();
    return new GoogleMapsDistanceCalculator(config, ...);
  },
  inject: [ConfigService, /* logger token */],
}
```

### Convention: dummy-key sentinel

Her vendor için env değeri `<vendor-prefix>_DUMMY_*` ile başlarsa mock devreye
girer. Google için `AIzaSy_DUMMY_*`, iyzico için `sandbox-DUMMY-*`, vs.
`.env.example` her zaman dummy ile gelir; yeni geliştirici `pnpm install &&
pnpm db:up && pnpm dev` çalıştırır, hiç API key olmadan boot eder.

### Convention: testlerde her zaman mock

Integration test setup (`test/setup-integration.ts`) dummy değer set eder.
Vitest sürecinde gerçek API'ya hiç dokunulmaz. Network izolasyonu doğal.

### Convention: vendor error → domain error

Adapter HTTP/network/parse hatasını yakalayıp `DomainError` subclass'ına
çevirir (`DistanceCalculationFailedError` gibi). Use case axios'tan hiç
haberdar değil.

## Consequences

### İyi

- **Test deterministic, ücretsiz, hızlı.**
- **Dev sıfır-friction onboarding** — dummy key ile boot ediyor.
- **Adapter swap** — vendor değişirse (Google → Mapbox) sadece yeni adapter,
  domain ve use case dokunulmaz.
- **Circuit breaker / retry / timeout** adapter'a iliştirilebilir, port aynı.

### Maliyet

- Her integration için 3 dosya (port + 2 adapter) + factory satırı. Ama A2c'den
  beri `ClockPort` / `RateLimiterPort` / `OutboxWriterPort` aynı disiplindeydi —
  pattern bedava artık.

### Riskler

- **Mock ile prod davranış sapması.** MockDistanceCalculator haversine × 1.4
  veriyor; gerçek Google traffic-aware. Rounding sınırlarında sapma kabul
  edilebilir; quote breakdown belirleyici (rule + multiplier deterministic).
- **Dummy key prod'a sızması.** `.env.example` "DUMMY_REPLACE_WITH_REAL_KEY"
  ile signal veriyor. Prod deploy script env'leri Infisical/Doppler'dan
  çeker, accidentally `.env.example`'ı kullanmaz. A4 deploy runbook'una
  "secret rotation" maddesi eklenecek.

## Alternatives Considered

### Vercel-style request middleware (interceptor)

Reddedildi: HTTP response shape'i her vendor için farklı. Generic interceptor
domain mapping'i kaybeder; her use case kendi error parsing'ini yapar.

### nock veya msw ile network-level mock

Reddedildi: test'te mock ama dev'de hâlâ gerçek key zorunlu. `.env.example`
default'unun çalışmaması = onboarding friction.

### Feature flag (Unleash/Flagsmith)

Reddedildi: dummy/real seçimi runtime değil deploy-time karar. Flag overhead
gereksiz.

## Revisit Trigger

- **External integration sayısı 5+** olunca shared `common/external/` modülü
  düşünülür: ortak retry, circuit breaker (resilience4ts veya cockatiel),
  request/response logging, latency metrics.
- **Vendor SLA delgileri** — gerçek Google quota %95'i geçerse rate limit
  - queue eklenir (BullMQ delay).

## References

- Implementation:
  - `apps/api/src/modules/pricing/application/ports/distance-calculator.port.ts`
  - `apps/api/src/modules/pricing/infrastructure/distance/mock-distance-calculator.ts`
  - `apps/api/src/modules/pricing/infrastructure/distance/google-maps-distance-calculator.ts`
- Similar pattern: ADR 0014 (ClockPort), ADR 0009 (RateLimiterPort), ADR 0013 (StoragePort)
- Env signal: `GOOGLE_MAPS_API_KEY=AIzaSy_DUMMY_*`
