# Customer Mobile App (A4d)

Expo SDK 52 + React Native 0.76 + Expo Router + NativeWind v4. Customer-
facing iOS/Android app — düğün/etkinlik müşterisi browse + book akışını
buradan yapacak. Driver app (`apps/driver-mobile/`) A4f'de gelecek
ayrı bundle.

## A4d-1 + A4d-2 + A4d-3 kapsamı (mevcut, A4d TAMAMLANDI)

**A4d-1** (auth scaffolding):

- Expo SDK 52 monorepo iskelet, NativeWind v4 + brand palette (siyah + gold)
- Token storage (SecureStore) + API client (single-flight refresh)
- Auth bootstrap + Context + login/logout
- Telefon → OTP → home → profile akışı

**A4d-2** (booking flow):

- Cached user offline-first (SecureStore session = tokens + user)
- Catalog browse: GET /catalog/categories/:slug → vehicleType list +
  detail → "Fiyat Al"
- Quote flow: pickup/dropoff (manuel) + datetime (text input
  placeholder, A4d-3 picker) + addon picker → POST /pricing/quotes
- Quote summary: full breakdown (base/distance/hourly/multipliers/
  addons → total) + "Onayla" → POST /bookings/confirm (idempotent)
- My bookings: list (pull-to-refresh + useFocusEffect) + detail
  (status guidance per state) + cancel modal (CONFIRMED/DRIVER_ASSIGNED
  cancellable)
- Tab navigator: 3 tabs (Anasayfa / Rezervasyonlar / Profil) + 4 hidden
  detail routes
- shared-types Zod runtime parse at API boundary (catalog/pricing/
  booking shapes); ~10–15 KB gzipped accepted in exchange for drift
  detection at first parse

**A4d-3** (polish — bu oturum):

- Native datetime picker (`@react-native-community/datetimepicker` 8.2.0)
  — iOS modal w/ "Tamam" + Android default modal
- Lucide vector icons (`lucide-react-native` + `react-native-svg` 15.8.0)
  — `src/components/Icon.tsx` barrel; tab navigator + ErrorView +
  BookingCard status badges
- Jest + jest-expo + @testing-library/react-native — 12 smoke component
  tests. Vitest pure logic için kalır.
- `src/lib/logger.ts` PII redaction ile (phone/token/recipient/password/
  secret keys son-4 yıldıza maskelenir, `Logger.debug` prod'da no-op)
- `@babel/runtime` direkt dep (RN babel transform require eder)

## A4e-3'e ertelendi (push registration)

- Backend: `User.expoPushToken` + `pushTokenUpdatedAt` (Prisma migration),
  `UpdatePushTokenUseCase`, `PATCH /users/me/push-token`,
  shared-types `UpdatePushTokenInputSchema`
- Mobile: `expo-notifications`, `PushTokenService`, AuthContext'te
  verifyOtp sonrası registration, foreground notification handler
- Sebep: backend değişikliği (migration + use case + endpoint + push
  sender e2e) kendi oturumunu hak ediyor

## A4g (production deploy + brand)

- Real EAS Build setup (`eas init`, real projectId, eas.json profiles)
- Maps autocomplete + route preview
- Real brand identity (renk + tipografi + splash + app icon assets +
  vehicleType fotoğrafları)
- Brand SVG icon set (custom, lucide ile yan yana)

## A4f

- `apps/driver-mobile/` — sürücü tarafı, ayrı bundle

## Mutlaka uyulacak yeni kurallar (A4d-3)

### Icon kullanımı

Tüm icon'lar `src/components/Icon.tsx` üstünden gelir (`Icons.Home`,
`Icons.Car`, vs). Lucide'i direkt import etme — barrel pattern tree-
shaking + library-swap (A4g brand SVG'ler) için zorunlu.

### Logger (PII redaction)

`Logger.info/warn/error/debug` kullan, `console.*` hayır. PII otomatik
maskelenir (`/phone|recipient|password|token|secret/i` key pattern).
Production'da `Logger.debug` no-op. Yeni catch block'larda silently
yutma — Logger.warn ile en azından dev'de görünür yap.

### Jest vs vitest

- **vitest** = pure logic (storage, API client, bootstrap, formatters,
  logger). Hızlı, native shim yok.
- **jest** (`pnpm test:components`) = react-native bileşeni render
  edenler. jest-expo preset + babel transform + RN/Expo native module
  mocks gerektirir.
- Yeni component test'i ekleyeceksen `__tests__/<Name>.test.tsx` altında
  (jest.config testMatch ile yakalar).

### DateTimePicker platform UX

Android'de RN-DateTimePicker tek `onChange` ile open+set+close yapar
(type="set" commit, type="dismissed" cancel — ikisinde de modal'ı
biz kapatırız). iOS'ta inline wheel + Modal wrapper + "Tamam" butonu
zorunlu (iOS'ta sistem-modal yok).

## Mutlaka uyulacak yeni kurallar (A4d-2)

### shared-types runtime parse at API boundary

Her API response Zod parse'tan geçer (catalog: lokal strict schema;
pricing/booking: shared-types'ın kendi şemaları). Mobile bundle Zod'u
ship eder (~10–15 KB gzipped) — A4d-1'deki "no Zod in mobile" kararı
**revize**. Sebep: API surface büyüdükçe şape drift'i sessiz runtime
hatasından daha pahalı; parse() throw'u erken yakalar.

**Catalog** için `ServiceCategoryDetailStrictSchema` lokal — server-side
`vehicleTypes: z.array(z.unknown())` yeterli değil; per-item schema
(`VehicleTypeSchema`) ile compose ediyoruz.

### API client singleton

`src/lib/api/index.ts` tek `ApiClient`'ı authApi/catalogApi/pricingApi/
bookingApi'ye thread eder. Single-flight refresh queue böylece tüm domain
wrapper'ları arasında de-dup yapar. **Yeni domain wrapper eklerken** bu
barrel'a register et — kendi ApiClient'ını oluşturma.

### Idempotency-Key her POST'ta

- `booking-confirm-${quoteId}` — double-tap iki booking yaratamaz
- `booking-cancel-${bookingId}-${secondBucket}` — second-bucket re-cancel
  later için key'i değiştirir
- `/pricing/quotes` server-side IdempotencyInterceptor'a sahip; mobile
  her quote isteği için yeni key gönderir (otomatik istemcide yok)

### Cancellable state guard

UI'da Cancel butonu **sadece** `CONFIRMED` veya `DRIVER_ASSIGNED`
state'lerinde gösterilir. `IN_PROGRESS` / `COMPLETED` / `CANCELLED_*` /
`EXPIRED` için button hidden. State machine sunucu otoritesidir; mobile
sadece görsel guard koyar.

### Maps placeholder

`src/lib/constants.ts` Sultanahmet → Beşiktaş coords export eder. Quote
formu bunu hardcoded gönderir. **A4d-3 swap point**: `DEFAULT_PICKUP_COORDS`
ve `DEFAULT_DROPOFF_COORDS`'u grep et, autocomplete callback ile değiştir.

### Manual datetime input

`lib/format/datetime.ts` `YYYY-MM-DD HH:mm` parse eder, Feb-30 round-trip
reject ile. A4d-3 native picker geldiğinde çıktı Date olduğu için call
site'lar değişmez.

## Mimari

```
apps/customer-mobile/
├── app/                      Expo Router (file-based)
│   ├── _layout.tsx           Root: GestureHandler + SafeArea + AuthProvider + Stack
│   ├── index.tsx             Cold-start splash → redirects to (auth) or (app)
│   ├── (auth)/
│   │   ├── _layout.tsx       Auth stack
│   │   ├── phone.tsx         Telefon entry
│   │   └── verify.tsx        OTP entry
│   └── (app)/
│       ├── _layout.tsx       App stack
│       ├── index.tsx         Ana ekran (placeholder)
│       └── profile.tsx       Profil
├── src/
│   ├── components/           UI primitives (Button, Input, OtpInput, ...)
│   ├── contexts/             React Context (AuthContext)
│   ├── hooks/                Re-usable hooks (useAuth)
│   ├── lib/
│   │   ├── api/              fetch client + endpoint wrappers + errors
│   │   ├── auth/             bootstrap (saf fonksiyon, test edilebilir)
│   │   ├── format/           phone format (TR-mobile)
│   │   └── storage/          SecureStore wrapper
│   └── test/                 vitest setup + module mocks
├── tailwind.config.js        Brand palette
├── metro.config.js           Monorepo watchFolders + nodeModulesPaths
└── app.config.ts             Expo config (bundle id, EAS placeholder)
```

## Mutlaka uyulacak kurallar

### Token disiplini

- **Tokens SADECE SecureStore'da**. iOS Keychain / Android Keystore
  kullanılır. AsyncStorage yasak (Android'de unencrypted, root'lu
  cihazda trivial okunur).
- `secure-token-storage.ts` `getTokens()` ASLA throw etmez —
  corruption (malformed JSON / shape mismatch) → null + auto-wipe.
  Aksi halde bir kez bozulan keystore her cold-start'ta auth bootstrap'ı
  brick eder.

### API client

- **Single-flight refresh**: 5 paralel 401 → 1 refresh çağrısı.
  Refresh token rotate olduğu için yarışan refresh'ler birbirini
  invalidate eder ve user gereksiz logout olur. `pendingRefresh`
  promise client closure'unda yaşar; her retry path aynı promise'i
  await eder.
- **401 retry exactly once**: ikinci 401 → throw ApiError, infinite
  loop yok. AuthExpiredError + clearTokens + onAuthFailure çağırılır.
- **Anonymous endpoints** (otp/request, otp/verify, tokens/refresh)
  `anonymous: true` ile çağrılır → Authorization header eklenmez.

### Bootstrap

- Saf fonksiyon (`src/lib/auth/bootstrap.ts`). React'tan bağımsız
  test edilir.
- 4 terminal sonuç: `no-session`, `authenticated`, `expired`, `offline`.
- **Offline durumu**: NetworkError veya 5xx → tokens silinmez, çağrı
  yapan karar verir. (G4'te şimdilik unauthenticated'a düşürülüyor;
  A4d-2 cached user ile optimistic authenticated render edecek.)

### Phone format

- `lib/format/phone.ts` **input/display** layer'ıdır. API'ye giderken
  `toE164()` ile +905XXX şekline çevrilir.
- **Validation otoritesi** `@event-fleet/shared-types`'taki
  `PhoneE164Schema` (regex `^\+90(5)\d{9}$`). Mobil bundle'a Zod
  yüklenmez (~30KB tasarruf); shape doğrulama API tarafında.

### Test disiplini

- **Vitest scope**: SADECE saf logic (storage, API client, bootstrap,
  format). React/RN bileşenleri vitest'te koşmaz çünkü native module
  shim'leri (expo-secure-store, expo-constants) global setup'tan mock
  edilir.
- **Component test'leri** (Jest + jest-expo + @testing-library/react-native)
  A4d-3'e ertelendi. Brief'te G3 için TEST-FIRST zorunluluğu vardı
  (single-flight, corruption, bootstrap) — bu üçü pure logic, vitest
  ile karşılandı.

### TypeScript paths

- `react` ve `react/*` mobile-local'a paths ile redirect edildi
  (`tsconfig.json`). Sebep: monorepo'daki admin React 19 kullanıyor,
  RN 0.76 React 18 zorunlu — paths olmadan TS @types/react@19'u
  bulup `bigint` ReactNode mismatch ile JSX'i fail ediyor.
- `@types/react` + `@types/react-dom` pnpm.overrides'ta mobile'a
  scoped 18.3'e pin'lendi (root `package.json#pnpm.overrides`).
  Admin globally etkilenmiyor.

### NativeWind v4 + Babel

- `babel.config.js`'de SADECE `babel-preset-expo` (jsxImportSource:
  "nativewind") kullanılır.
- Eski `nativewind/babel` plugin'i ve `expo-router/babel` preset'i
  EKLENMEZ — SDK 50+'ten beri ikisi de babel-preset-expo'ya katlandı,
  tekrar eklemek duplicate-transform warning üretir.

## Çalıştırma

```bash
# Dev (Metro + QR code; ayrı terminalde Expo Go ile telefondan tara)
pnpm --filter @event-fleet/customer-mobile start

# Tip + test + lint
pnpm --filter @event-fleet/customer-mobile typecheck
pnpm --filter @event-fleet/customer-mobile test
pnpm --filter @event-fleet/customer-mobile lint

# Real device/simulator (xcode/android-studio kurulumu ister)
pnpm --filter @event-fleet/customer-mobile ios
pnpm --filter @event-fleet/customer-mobile android
```

## API endpoint'leri (mobile'ın tükettikleri)

- `POST /auth/otp/request` — phone → requestId + expiresAt
- `POST /auth/otp/verify` — phone + requestId + code → AuthTokens + user
- `POST /auth/tokens/refresh` — refreshToken → AuthTokens (rotated)
- `GET  /auth/me` — Bearer access → user summary

A4d-2'de catalog + pricing + booking endpoint'leri eklenecek.
