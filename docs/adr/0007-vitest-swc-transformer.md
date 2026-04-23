# ADR 0007 — Vitest SWC Transformer for NestJS DI

- **Status:** Accepted
- **Date:** 2026-04-23
- **Deciders:** Kurucu + Claude (lead engineer)

## Context

A2a'da `apps/api`'nin Vitest test suite'i ilk yazıldığında her e2e test'i şu
hatayla patladı:

```
TypeError: Cannot read properties of undefined (reading 'get')
  ❯ new RedisService src/common/redis/redis.service.ts:13
    const url = config.get("REDIS_URL", { infer: true });
```

`@Injectable()` sınıfların constructor'larına Nest'in DI container'ı parametre
geçemiyordu — `ConfigService` `undefined` olarak inject ediliyordu.

### Kök neden

Nest'in DI sistemi `experimentalDecorators: true` + `emitDecoratorMetadata:
true` çıktısına bağlıdır. `tsc` derleyicisi her constructor parametresinin
runtime tipini `Reflect.metadata("design:paramtypes", [...])` olarak emit eder.
Nest bu metadata'yı okuyup token resolution yapar.

Vitest'in default transformer'ı **esbuild**, hız için bu metadata'yı düzgün
emit etmiyor. Resmi olarak esbuild "decorator metadata" desteği sınırlı
(2024'te bir kısmı eklendi ama Nest'in beklediği davranış farklı).
Sonuç: production build (`nest build` → `tsc`) sorunsuz, ama Vitest altında
test edildiğinde DI patlar.

## Decision

`apps/api/vitest.config.ts`'ye **SWC transformer** ekledik:

```ts
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        target: "es2022",
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true, // ← critical
        },
      },
    }),
  ],
  test: { ... },
});
```

Yeni dependencies (apps/api devDeps):

- `unplugin-swc` — Vite plugin shim
- `@swc/core` — SWC çalıştırıcısı

SWC, TypeScript'in `emitDecoratorMetadata` davranışını eksiksiz reproduce
ediyor. Test'ler artık production build ile aynı runtime semantiğine sahip.

## Consequences

### Pozitif

- NestJS DI test'lerde production'la birebir çalışıyor.
- SWC native (Rust); test transformasyonu hızlı kalıyor, esbuild'den biraz
  yavaş ama anlamlı fark yok (~%5 test runtime overhead).
- Vitest'in caching ve UI özellikleri korundu; Jest'e geri dönmek gerekmedi.

### Negatif / Risk

- Ek iki transitive dep ağacı (`@swc/core` platform-spesifik binary getirir,
  `apps/api/node_modules` ~30 MB büyür). CI'da cache'lenebilir, sorun değil.
- SWC + esbuild paralel ayakta — Vite kendi içinde de esbuild kullanıyor;
  çakışma yok ama "iki transformer" konsepti yeni gelene kafa karıştırabilir.

## Alternatives Considered

- **`reflect-metadata` polyfill ekleyip esbuild'le devam** — denenmedi
  ama dokümantasyona göre yetersiz; emit'in kendisi eksik, polyfill runtime
  artık.
- **ts-jest** — Jest ekosistemine geri dönmek demek, Vitest tercihimizi
  iptal etmek; istemiyoruz.
- **`@swc/jest` (Jest + SWC)** — Aynı sebep; Jest'i bringback etmek
  istemiyoruz.
- **`tsx` veya `ts-node`** — Vite plugin entegrasyonu yok, Vitest'in iç
  loop'una sokulamaz.
- **NestJS 11 + Vitest 3 ile yeniden değerlendirme.** Ekosistem evrildikçe
  esbuild decorator desteği gelişebilir; revisit trigger: Nest 11 stable
  olduğunda bu ADR review.

## Operasyonel notlar

- Bu ADR `apps/api` dışındaki NestJS olmayan paketler için **gerekli değil**.
  Örn. `packages/shared-types` Vitest config'i SWC kullanmıyor, gerek yok
  (Zod schema'ları decorator metadata gerektirmiyor).
- Aynı problem ileride `apps/admin` (Next.js) testleri için çıkmaz — Next
  kendi transformer'ını kullanıyor.
