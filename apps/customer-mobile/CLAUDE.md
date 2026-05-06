# Customer Mobile App (A4d)

Expo SDK 52 + React Native 0.76 + Expo Router + NativeWind v4. Customer-
facing iOS/Android app — düğün/etkinlik müşterisi browse + book akışını
buradan yapacak. Driver app (`apps/driver-mobile/`) A4f'de gelecek
ayrı bundle.

## A4d-1 kapsamı (mevcut)

- Expo SDK 52 monorepo iskelet
- NativeWind v4 + brand placeholder palette (siyah + gold)
- Token storage (SecureStore) + API client (single-flight refresh)
- Auth bootstrap + Context + login/logout
- Telefon → OTP → home → profile akışı

## A4d-2'ye devredilenler (sıradaki oturum)

- Müşteri rezervasyon akışı (kategori seç → Quote al → confirm)
- Booking listesi + detay
- Push notifications (Expo Push)
- Cached user (offline cold-start optimistic render için)

## A4d-3 (polish)

- Gerçek brand identity (renk + tipografi + ikon paketi)
- Component test suite (Jest + jest-expo + RTL)
- Splash + icon assets (şu an Expo default placeholder)
- Detox e2e testleri

## A4f / A4g

- A4f: `apps/driver-mobile/` (sürücü tarafı, ayrı app)
- A4g: EAS Build setup (real `eas.json` + projectId, production build)

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
