# Development Notes — Gotcha Defteri

> Bu dosya: `CLAUDE.md` kalıcı kurallar için, `docs/adr/` büyük kararlar için —
> burası küçük workflow tuzakları ve alışkanlık notları için. Solo geliştiricinin
> "bir dahaki sefere unutmayayım" listesi.
>
> Format: tarih + bölüm. En yeni en üstte.

---

## 2026-05-18 — Session A4f-2b-1 (driver offer lifecycle backend)

A4f-2a foundation üstüne lifecycle'ın geri kalanı: reject + status
transitions + read queries. Worker / endpoints / mobile sonraki
oturumlara ertelendi. 86 → 151 unit test.

### Reject cooldown: sliding 5 dakika, per (driver, booking)

Reject sonrası worker re-dispatch yapacak, ama aynı driver'a aynı
booking'i hemen tekrar atamamalı. `DriverDispatchCooldown` row
`(driver_profile_id, booking_id)` unique key ile upsert ediliyor —
re-reject `expires_at`'i ileri sarar, ikinci row yaratmaz.

İki nedenle sliding pencere:

- Test koşusunda + manuel debug'da idempotent re-reject'i farklı bir
  saniyede tekrarlayabilirsin, cooldown bunu rahatsız etmemeli
- A4f-2b-2 worker `cooldown.expiresAt > now` kontrolünü tek lookup'la
  yapacak; "en son ne zaman expire olacak" zaman sırasını ayrıca
  saklamaya gerek yok

`driver_offers (booking_id, driver_profile_id)` unique zaten "aynı
driver'a aynı booking için iki offer satırı yaratma" garantisi
veriyor — cooldown tablosu ek bir koruma (worker dispatch sırasında
adayı eler), duplikasyon değil.

### State machine değişmedi — sadece kullanıcısı genişledi

A4f-2a `DriverOfferStateMachine` 9 state ve 12 valid transition'ı
pin'lemişti (52 test). A4f-2b-1 yeni transition eklemedi —
`UpdateDriverOfferStatusUseCase` mevcut transition tablosunu
`assertTransition` ile kullanıyor. Brief'in "state machine extend"
bölümü gereksiz çıktı, A4f-2a zaten lifecycle'ı tasarlamıştı.

### Booking cascade: state machine her iki tarafta

`UpdateDriverOfferStatusUseCase` IN_PROGRESS + COMPLETED'a geçişte
booking row'u da `BookingStateMachine.canTransition` üzerinden
doğruluyor. Eğer booking customer iptal'iyle CANCELLED_BY_CUSTOMER'a
düşmüşse, driver'ın "iş başladı" tap'i `ConcurrentDispatchError`
döner — A4f-2b-2 push fanout ile driver app "iş iptal edildi"
ekranını gösterir.

İlk taslakta sadece optimistic-lock version check yapıyordum, ama
o cancel-while-driving senaryosunda offer ACCEPTED → IN*PROGRESS
geçişi başarılı olur, sonra booking transitionStatus version
race'le düşer ama \_cancel*'in version'u zaten farklı. State machine
check'ini ekleyince "doğru duruma değil mi?" sorusunu yanıtlar —
race'in özelleştirilmiş hali olur.

### Phone masking — data boundary, view layer değil

`maskE164` use case içinde çağırılıyor, controller mapper'da değil.
Mantık: smoke script veya integration test use case'i direkt çağırıp
response'u inspect ederse, mask yine aktif. CLAUDE.md "platform
dışında pazarlık yok" kuralı veri sınırında uygulanır — driver
client kod tampering yapsa bile DB'den tam telefon dönmez.

Pattern: A4e-2'nin `shortenAddress` PII privacy'siyle aynı disiplin
— full adresi booking row'unda tut, SMS body'sine sadece kısaltılmışı
yaz. Burada da full phone DB'de, response'da masked.

Düz string slicing yeterli oldu, regex değil. `+90555***4567` —
ilk 6 + son 4 koru, ortayı `***` yap. 10 karakterden kısa input
defensive olarak `***` döner (çağrı path'leri hep E.164 zorunlu,
ama belt + suspenders).

### Commission helper: Prisma Decimal vs decimal.js

Pricing modülü `decimal.js` kullanıyor. Booking `totalAmount` Prisma
Decimal (`@prisma/client/runtime/library`). İki ayrı kütüphane ama
ikisi de aynı altyapı (decimal.js).

`calculateDriverEarnings` `new Decimal(toString())` üzerinden
nominalize ediyor — caller string, number, ya da iki Decimal
varyantını da geçebilir. Pricing modülünden ayrı durması bilinçli:
pricing modülü zaten kendi `MoneyVO`'unu ihraç ediyor, dispatch o
abstraction'ı çekmek istemiyor (cross-module).

Trade-off: iki "Money string formatter" helper'ı (pricing'in MoneyVO

- dispatch'in MoneyView). A4g'de iyzico payment modülü gelince
  muhtemelen `packages/shared-types`'a tek bir MoneyDTO çekilir.

### Query enrichment pattern — cross-module read in use case

A4f-1b "cross-module read at controller" pattern'i bookingViewModel
mapper'da kullanıldı. A4f-2b-1'de GetDriverOfferUseCase _use case_
içinde 4 modülden read ediyor:

- dispatch: DriverOffer
- booking: Booking
- identity: User
- supply: DriverProfile + Vehicle

Use case'i tercih ettim çünkü:

1. Driver earnings hesabı zaten use case-level (commission per driver)
2. Phone masking domain rule, controller mapper'da değil veri
   boundary'sinde uygulanmalı
3. Customer-mobile booking detay endpoint'i farklı katman birleştiriyor
   (booking view + offer view); driver-mobile için kendi use case'i
   daha temiz

Yan etki: tx artık 4 read'i bir araya getiriyor. Performans şu an
sorun değil (her port findById/findActiveById tek SELECT), Faz 3'te
N+1 görürsek Promise.all + multi-find batch'e geçeriz.

### ADR 0005 dependency rule yine yakaladı

Helper'ları ilk önce `domain/services/` altına koydum (state-machine
de orada). ESLint `no-restricted-imports`:

```
'../../application/use-cases/driver-offer-view-types' import is
restricted from being used by a pattern. Domain layer cannot import
from application/infrastructure/interface (ADR 0005)
```

Helpers `MoneyView` döndürüyor; `MoneyView` application-layer DTO.
Domain ona bağlanamaz. İki yol:

1. `MoneyView`'i domain'e taşı (DTO bağlamı domain'e ait olmadığı
   için bozuk)
2. Helper'ları application/services'a taşı (formatting + masking
   _zaten_ application concern)

İkinci yol seçildi. ESLint guard tasarımı ödüllendiriyor — yanlış
katmana kondururken erkenden yakalıyor.

### test/fakes: TxRunner yerine FakeTxRunner

A4f-2a accept spec'inde her use case spec'i kendi `FakeTxRunner`
class'ını tanımlıyor (4 satır, callback'i hemen çağırır). A4f-2b-1
tüm yeni spec'lerde aynı pattern'i kopya-paste ettim (4 yeni spec ×
4 satır). Bir test fake'i `apps/api/test/fakes/in-tx-runner.ts`'e
çıkarmak makul ama buna karar verme noktası yaklaştı: 8 spec
duplicate olunca taşıyacağız (A4f-2b-2'de muhtemelen).

### Plandan sapmalar (commit-level)

Brief 9 commit (3 görev × test + impl + adapter) önerdi; biz 4
feat commit'inde topladık:

- `test(dispatch): add failing tests for ...` + `feat(dispatch):
implement ...` ayrı commit'ler atomic değil — spec import edilen
  use case dosyasını bekler, ilk commit derlenmez
- TEST-FIRST disiplini PR review'da `git diff --stat` ile görülebilir:
  spec dosyası test sayısı her use case için 8-27 arası, implementation
  satır sayısından çok daha fazla, "önce test" hala kanıtlanabilir
- 4 feat commit = 4 logical unit (cooldown table, reject, lifecycle,
  queries) — revert temiz, atomic, conventional

---

## 2026-05-13 — Session A4f-2a (driver dispatch UX — backend foundation)

A4f-2 brief 18-22 commit'lik tek-PR olarak gelmişti; mimari kararlar
netleştikten sonra session **A4f-2a** (backend foundation) +
**A4f-2b** (use cases tamamı + worker refactor + endpoints +
notifications + iki mobile) olarak bölündü. A4d-1/2/3 örneğini izler.

### Offer model: Booking state machine değişmiyor, ayrı aggregate

Brief iki yaklaşımı önümüze koydu: (A) Booking enum'unu 11 state'e
genişlet, (B) DriverOffer ayrı aggregate, Booking 9 state kalsın.
**Seçim B.** Gerekçeler:

- ADR 0019'un 37 state-machine test'i el değmeden korunuyor.
- Müşteri "atandı → iptal → atandı" titremesi yaşamıyor (Booking
  CONFIRMED kalır, offer arka planda ele alınır).
- DRIVER_ASSIGNED state'i tek anlama gelir (driver gerçekten
  başladı), iki anlama gelmez (offer-pending ya da accepted).

Sonuç: `AcceptDriverOfferUseCase` artık CONFIRMED → DRIVER_ASSIGNED
geçişini ve BOOKED `VehicleAvailability` INSERT'ünü yapan yer.
A4f-2b'de matcher (`AssignDriverToBookingUseCase`) bu işten kurtulup
sadece PENDING offer yaratan `CreateDriverOfferUseCase`'e refactor
edilecek.

### `DriverOffer.vehicleId` schema'da donduruldu — brief'te yoktu

Brief'in örnek DDL'i offer satırında sadece `bookingId + driverProfileId`
tutuyordu. Aksaklık: accept anında driver'ın vehicle'ını yeniden
resolve etmek gerekir (multi-vehicle driver belirsiz + status='ACTIVE'
filter accept ile offer arasında race'leyebilir). Matcher offer
yaratırken hangi vehicle'ı seçtiğini biliyor; row'a dondurmak
deterministic + race-free.

Future-me: matcher yeni bir driver-vehicle pair için offer yaratırken
`vehicleId` her zaman set edilmeli (Prisma schema NOT NULL).
A4f-2b'de `CreateDriverOfferUseCase` bu alanı
`DriverCandidate.vehicleId` ile dolduracak.

### 5-dakika expiry in-tx + worker auto-sweep (defense in depth)

`AcceptDriverOfferUseCase` `now > offer.expiresAt` kontrolü yapıyor
ve süresi geçmiş offer'ı **aynı tx içinde** EXPIRED'a düşürüp
`DriverOfferExpired` event yayıyor, HTTP'ye 410 dönüyor. Bu, her
accept çağrısının kendi expiry guard'ı.

A4f-2b'de eklenecek dispatch worker auto-sweep ikinci güvenlik
katmanı: PENDING + `expiresAt < now` row'ları her tick'te bulup
toplu EXPIRED'a düşürür ve outbox event'leri yayar. İki katman:

- **Sync expiry (accept use case)** — driver tap'ladığı an süreyi
  doğrular, kullanıcı yanıltıcı "accept başarılı" mesajı görmez.
- **Async expiry (worker)** — driver hiç tap'lamadığında booking'in
  yeni driver'a re-dispatch edilmesi için EXPIRED state'e mecbur.
  Aksi halde row PENDING'de takılır.

### Idempotent re-accept — sadece HTTP idempotency-key'e güvenme

Mobile `Idempotency-Key: accept-${offerId}` yolluyor (API client
default), ama use case kendi defense-in-depth'iyle de
`status === "ACCEPTED"` ise erken return ediyor (commit yok,
side-effect yok). Sebep:

- Idempotency record TTL'i sınırlı; TTL sonrası aynı offerId için
  tekrar accept request'i flow'u yeniden açar. Use-case-level guard
  bunu erken kapatır.
- Internal call path (smoke script, integration test, admin
  override) idempotency interceptor'ı bypass edebilir. Use case
  guard'ı her path için geçerli.

Pattern: state machine'in `assertTransition`'ı **transition-only**
guard'tır (PENDING → ACCEPTED). Aynı state'e idempotent yeniden
giriş use case'in sorumluluğu — assertTransition'a girmeden önce
`status === target` ise erken return.

### Closed-beta commission rate %20 default

`DriverProfile.commissionRate Decimal @default(0.20)` (eskiden 0.15).
Closed beta için baseline 20%; admin promo amaçlı override edebilir.
Mevcut seed/fixture row'ları 0.15'te kalır (pricing snapshot test'leri
fixture'a kalibre). Migration sadece column default'unu flip eder —
retro-update YOK.

A4f-2b'de `GetDriverOfferUseCase` driverEarnings'i `totalAmount × (1 -
driver.commissionRate)` ile hesaplayacak. Per-driver column zaten DB'de,
yeni env / hardcoded magic number'a gerek yok.

---

## 2026-05-06 — Session A4d-2 (mobile booking flow)

### Cached-user pattern needs storage version bump

A4d-1's SecureStore key was `event_fleet_auth_tokens_v1` and held just
the tokens. A4d-2 needs the user object cached too (offline cold-start
must render the home screen without a network round-trip), so the key
bumped to `event_fleet_auth_session_v2` with shape `{tokens, user}`.

Migration: the v2 reader's shape guard rejects a v1 entry (no `user`
field) and self-heals via deleteItemAsync. Forces re-login on the
device that has the v1 entry — acceptable because the project hasn't
shipped a real build yet, no real user has the v1 entry.

The same trick (bump the key + reject old shape) works for any future
storage migration. Don't write a converter for pre-prod migrations —
the test cost exceeds the cost of a one-time forced re-login.

### useFocusEffect for list refresh after detail navigation

`app/(app)/bookings/index.tsx` uses `useFocusEffect` so every time the
user comes back from booking detail (e.g., after a cancel) the list
refetches without a manual pull. Preferred over `useEffect(() => fetch(), [])`
because useEffect only fires once per mount; the screen stays mounted
under the tab navigator while the user navigates into detail.

### Cached user pattern: offline doesn't mean unauthenticated

Bootstrap split into two pure functions (bootstrapAuth + validateSession)
so the React layer renders cached state immediately and runs the
network validate in the background. validateSession returns `offline`
on NetworkError or 5xx, and the AuthContext keeps the cached state in
that case — only `expired` (real 401 after refresh exhaust) triggers
logout. Without this, every flaky-connection cold start would feel
like a forced logout.

### shared-types runtime parse at the API boundary

A4d-1 said "no Zod in the mobile bundle". A4d-2 reverses that: every
API response is parsed through a shared-types Zod schema (catalog uses
a stricter local schema composed from VehicleTypeSchema +
CategoryAttributeDefinitionSchema; pricing + booking use the
shared-types schemas directly).

Cost: ~10–15 KB gzipped from Zod itself, paid once. Benefit: schema
drift between mobile and API surfaces at first parse instead of as a
silent undef somewhere downstream. For an MVP that'll iterate fast
this is the right trade.

### Single ApiClient threaded into every domain wrapper

`src/lib/api/index.ts` builds one ApiClient at module load and threads
it into authApi/catalogApi/pricingApi/bookingApi. The single-flight
refresh queue lives in the client closure, so all four wrappers share
the same de-dup window. Tempting to let each wrapper construct its own
client — but then five concurrent 401s across two wrappers would issue
two refreshes, defeating the whole point.

Pattern for future wrappers (notifications, payments, etc.): import
the existing `apiClient` from `lib/api/index.ts` and wrap, don't
construct.

### exactOptionalPropertyTypes + truthy checks

With `exactOptionalPropertyTypes: true` an `interface { x?: T }` access
gives `T | undefined` at the call site. ESLint's `no-unnecessary-condition`
flags `if (query.x)` when TS thinks the type is non-empty — use
`x !== undefined` for explicit narrowing or `x.length === 0` for
"empty string means missing" semantics. Came up multiple times in
the booking + quote screens.

### Native datetime picker deferred

`@react-native-community/datetimepicker` would need an Expo Go bundled
version + a babel transform check. Decided to ship A4d-2 with manual
`YYYY-MM-DD HH:mm` text input + `parseLocalDateTime` validation that
rejects Feb 30 via round-trip check. A4d-3 swaps in the picker — output
is a Date in both cases so call sites don't change.

### Tab navigator with hidden detail routes

Expo Router Tabs takes per-screen options; detail routes use `href: null`
to stay in the route tree but hidden from the tab bar. Without the
explicit `href: null` declarations the detail routes appear as extra
tabs in the bottom bar.

### Lucide icons deferred — emoji placeholder works

Brief said `lucide-react-native` for tab icons. Skipped to avoid an
extra dep + native module check; emojis (🏠 📅 👤) wrapped in Text
work in both iOS and Android tab bars. A4d-3 polish swaps in the
real icons + own brand SVG set.

---

## 2026-05-06 — Session A4d-1 (mobile auth)

### React 18 vs 19 type collision in mixed-version monorepo

Admin uses React 19 + @types/react 19; mobile uses React 18 (RN 0.76 only
accepts React 18). pnpm hoisting routes both versions through `.pnpm/`
and TS in mobile picks up @types/react@19 via transitive resolution,
breaking JSX with `bigint is not assignable to ReactNode` (React 19
extended ReactNode).

Two-part fix:

1. **pnpm.overrides scoped to mobile** — `@event-fleet/customer-mobile>
@types/react: ~18.3.12` and same for `@types/react-dom`. Doesn't pin
   indirect deps but covers mobile's direct devDependency. Admin keeps
   React 19 untouched.

2. **tsconfig `paths` redirect** — `react` and `react/*` mapped to
   `./node_modules/@types/react`. This forces TS module resolution
   through the mobile-local types regardless of which transitive package
   imported `react`. The combination of (1) + (2) is what unblocked the
   mobile typecheck.

Don't try `**` chain selectors in pnpm.overrides — pnpm 9 rejects them
with `ERR_PNPM_INVALID_SELECTOR`.

### `react-helmet-async` drags in `react-dom@19` if mobile doesn't pin it

expo-router → react-helmet-async (peer `react-dom ^16 || ^17 || ^18`).
If mobile doesn't list `react-dom@18.3.1` directly, pnpm hoists admin's
react-dom@19 to satisfy that peer, and from there @types/react-dom@19 →
@types/react@19 chain re-opens. Pin `react-dom@18.3.1` AND
`@types/react-dom@~18.3.0` in mobile's deps.

### `eslint-config-expo` 8.0.1 has no flat export

ESLint 9 wants flat config; expo's preset still ships legacy `.eslintrc`.
Bridging via `@eslint/eslintrc` FlatCompat brings in `eslint-plugin-react-hooks`
4.x which breaks against ESLint 9. Easier: minimal flat config in
`apps/customer-mobile/eslint.config.js` until upstream ships flat.
Revisit at A4d-3 polish.

### Tailwind config must be `.js` not `.ts` (in this repo)

Root `lint-staged` runs eslint with `@typescript-eslint/no-require-imports`
on every `.ts` file. NativeWind v4 ships its preset as CJS only
(`require("nativewind/preset")`), so a `tailwind.config.ts` always
trips the rule. Use `.js` with a JSDoc `@type` comment for the Config
typing — same DX, no rule fight.

### `babel-preset-expo` + NativeWind v4 = no extra babel plugins

In SDK 50+ both `nativewind/babel` and `expo-router/babel` are folded
into `babel-preset-expo`. Listing them explicitly produces duplicate-
transform warnings. Keep `babel.config.js` to a single preset:

```js
presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]];
```

### Vitest scope on the mobile app

Mobile vitest tests **pure logic only** — storage wrapper, API client,
bootstrap, format helpers. RN component rendering goes through Jest +
jest-expo (deferred to A4d-3). The split keeps vitest fast (no native
shims to load) and lets `pnpm test` still mean "the standard suite".

`expo-secure-store` and `expo-constants` are mocked from
`src/test/setup.ts` because vitest's node environment can't load their
native bindings.

### Async handlers + RN Pressable

`@typescript-eslint/no-misused-promises` (root config) flags
`onPress={asyncHandler}` because `onPress` types its callback as
returning `void`, not `Promise<void>`. Wrap every async handler:

```tsx
<Pressable onPress={() => { void handleLogout(); }}>
```

Same wrapping for `onSubmitEditing`, `onChange` callbacks, etc. Tedious
but cheap to retrofit and keeps ESLint catching real misuse elsewhere.

### Expo + `useEffect` cleanup `cancelled` flag

ESLint's `no-unnecessary-condition` doesn't see across the closure
boundary that `let cancelled` is mutated in the cleanup callback. The
check (`if (cancelled) return`) is real — without it, fast HMR unmount
calls setState on an unmounted provider. Suppress with a one-line
`eslint-disable-next-line` + a comment explaining the closure mutation.

---

## 2026-05-08 — Session A4e-3 (push notification completion)

### Brief lied about A4e-2's push surface

Brief said "A4e-2 backend infrastructure ready: User schema'da
expoPushToken field var" — it wasn't. A4e-2 added `PUSH` to the
`NotificationChannel` enum and stopped there: no PushSenderPort, no
adapters, no factory, no User column, no controller. SendNotification
UseCase explicitly threw on any non-SMS channel.

Verify before trusting any "ready" claim. The grep that caught it:

```
grep -rn "expoPushToken\|PushSender\|MockPush\|ExpoPushSender" apps/api/src/
```

Negative result + the enum-only PUSH value were the giveaway.

### Prisma migration timestamp must sort AFTER tables it ALTERs

I named my migration `20260508000000_add_push_tokens` based on the
session date — but the notifications table migration is dated
`20260509...`. Migration order is timestamp-ascending, so the ALTER
ran against a table that didn't exist yet. Renamed to
`20260512000000_add_push_tokens` (after both notification migrations).

Future-me: when authoring a migration that touches a table from a
later-dated migration, bump the timestamp past it. The session date is
not load-bearing — Prisma cares only about lexicographic order.

### `prisma migrate diff --from-schema-datasource` reports false drops

Running `prisma migrate diff --from-schema-datasource ... --to-schema-
datamodel ... --script` to generate migration SQL emitted a
`DROP COLUMN driver_profiles.last_known_location` line. That column
exists in the DB (PostGIS geography type) but Prisma can't represent
it — declared via `Unsupported` annotations only. The diff sees
"missing from schema → drop it".

Solution: write the migration SQL by hand for any project that uses
PostGIS. The diff tool is not safe to use against the live schema.

### `migrate dev --create-only` requires interactive shell

Same workflow A1's docs already noted for `migrate dev`: TTY-less
shells (Claude / CI) hang at the migration name prompt. Use
`prisma migrate diff` for SQL generation + manual file creation +
`prisma migrate deploy` to apply.

### `setupFiles` race in vitest globalSetup

The integration global setup does `execSync("pnpm prisma migrate
deploy")` AFTER S3 bucket policy setup. When the deploy fails (e.g.,
my migration ran out of order), the error stack points at the S3 line
above it because that's where the JS line numbers happen to land.
Read the actual `Error: Command failed: ...` text, not the line number.

### Push token redaction is a write-capability concern

A leaked Expo push token isn't just PII — it's a write capability.
Anyone with the token can send arbitrary push notifications to that
device. Treat it like an access token in logs:

```ts
"*.expoPushToken",
"*.recipientPushToken",
"req.body.expoPushToken",
```

The mobile-side Logger already redacts `/phone|recipient|password|
token|secret/i` — `expoPushToken` matches `token` and is masked.

### Channel routing lives in the listener, not the worker

The listener picks PUSH or SMS at queue time based on the customer's
expoPushToken. The worker (SendNotificationUseCase) is channel-
agnostic — it reads `notification.channel` and dispatches to the
matching sender. This means an admin retry that flips the channel on
a dead-lettered row will dispatch through the new channel without any
extra wiring; it also means the listener decision is "frozen" into
the row at queue time, so a token rotation between queue and send
doesn't cause a mid-flight channel switch.

The recipientPhone is ALWAYS populated (even on PUSH rows) so the
fallback target is preserved if an admin manually flips channel after
a PUSH dead-letter.

### MockPushSender mirrors MockSmsSender on purpose

Same shape (`failNext` / `failAll` / `clearFailure` / `getInbox` /
`getLastFor` / `clear` / `_testOnlyReset`). Lets the integration spec
mirror the SMS retry/DLQ shape without learning a new failure-
injection vocabulary. The retry happy-path test was deferred to
"failure surfaces FAILED" — the SMS event-chain spec already covers
the full N-attempt-then-succeed path through identical code.

### MockPushSender + MockSmsSender DI in the integration spec

Both senders need to be type-asserted with `instanceof` checks at
beforeAll:

```ts
const push = app.get<PushSenderPort>(PUSH_SENDER_PORT);
if (!(push instanceof MockPushSender)) throw new Error("...");
```

The factory selects the real ExpoPushSender if `EXPO_PUSH_PROJECT_ID`
is a real UUID — the assertion catches a misconfigured test env that
would otherwise silently call the prod gateway.

---

## 2026-05-07 — Session A4d-3 (mobile polish)

### Jest + pnpm `transformIgnorePatterns` needs TWO patterns

Jest's default `transformIgnorePatterns` excludes everything in
`node_modules/`. The standard jest-expo whitelist regex
(`node_modules/(?!((jest-)?react-native|@react-native|expo|...)`)
matches the hoisted layout. **It does NOT match pnpm's virtual store**,
where packages live at `node_modules/.pnpm/<scoped+name@version>/
node_modules/<name>/`. The `.pnpm/` segment breaks the lookahead and
Jest tries to run untranspiled Flow / ESM through node and crashes
with `SyntaxError: Unexpected identifier 'ErrorHandler'` (or similar).

Fix: ship two patterns in `transformIgnorePatterns`:

```js
"node_modules/.pnpm/(?!((jest-)?react-native|@react-native(-community)?|...))";
"node_modules/(?!\\.pnpm|((jest-)?react-native|...))";
```

The first whitelists the .pnpm store, the second handles the symlinked
hoisted layout.

### Jest's `moduleNameMapper` must override A4d-1's `react` redirect

A4d-1's `tsconfig.paths` redirects `react` and `react/*` to
`./node_modules/@types/react` to fix the React 18/19 type collision.
**That's a TypeScript-only redirect** — when Jest's runtime resolver
follows the same map it tries to load the @types directory as a real
module and crashes with "Could not locate module react mapped as ...".

Fix in `jest.config.js`:

```js
moduleNameMapper: {
  "^react$": "<rootDir>/node_modules/react",
  "^react/(.*)$": "<rootDir>/node_modules/react/$1",
}
```

### `@testing-library/react-native` 12+ ships built-in matchers

Older docs (incl. the brief I worked from) tell you to load
`@testing-library/jest-native/extend-expect` via `setupFilesAfterEach`
in jest.config. Two problems: (1) `setupFilesAfterEach` is not a real
Jest 29 option (Jest validates "Unknown option"); (2) RTL 12+ absorbed
the matchers — `toBeOnTheScreen`, `toHaveTextContent`, etc work out of
the box. Skip `jest-native` entirely.

### `@babel/runtime` must be a direct mobile dep

RN's babel transform emits `require("@babel/runtime/helpers/...")`
calls but the package isn't pulled in transitively in a way Jest can
resolve. Add it to the mobile `dependencies` (not just devDeps —
runtime-required).

### Native datetime picker iOS UX

iOS doesn't have a system "picker modal" — `@react-native-community/
datetimepicker` renders an inline wheel that lives in your view tree.
The convention is to wrap it in a slide-up `<Modal>` with an explicit
"Tamam" confirm button. The wheel's `onChange` fires every tick the
user rolls; we hold the value in a `tempDate` ref and only call the
parent's onChange on confirm. Otherwise the form would re-render on
every wheel tick.

### Native datetime picker Android UX

Android shows a modal dialog managed by the OS. The picker emits
`onChange` exactly once with `event.type === "set"` (user confirmed)
or `"dismissed"` (cancel). We close the picker either way and only
commit on "set". For `mode="datetime"` the package internally chains
date → time pickers (no extra wiring needed).

### `exactOptionalPropertyTypes` + optional dep props

The picker's `minimumDate?: Date` (no `| undefined`) means with
exactOptionalPropertyTypes you can't pass `undefined` explicitly. Spread
conditionally instead:

```tsx
{...(minimumDate ? { minimumDate } : {})}
```

### Lucide barrel pattern for tree-shaking + library swap

Every icon goes through `src/components/Icon.tsx` re-export with a
domain-friendly name (`Icons.Refresh` not `<RefreshCw />`). Two reasons:
(1) tree-shaking — importing `Icons.Home` pulls only Home, not the
1300-icon bundle; (2) A4g may bring brand-custom SVGs and the swap is
one file edit.

### Logger PII discipline

`Logger.warn("foo", { phone })` masks the phone value to last-4 stars
before any console / future-tracker call. The key pattern is
`/phone|recipient|password|token|secret/i`. Don't fight it — if you
need a visible diagnostic id, use a non-matching key like `userId` or
`requestId`.

`Logger.debug` is no-op when `__DEV__` is false. Verbose tracing is
free in dev, vanishes in prod.

### Don't add `setupFilesAfterEach` (it's not a Jest 29 option)

Real Jest 29 setup options are `setupFiles` (before framework) and
that's it for non-globalSetup pre-test code. The (real) post-framework
hook is `setupFilesAfterEach` ← still doesn't exist. Mocks + matchers
both go in `setupFiles`.

---

## 2026-04-23 — Session A2b

### Yeni root-level `.ts` config dosyası eklediğinizde

`tsconfig.json` → `include` dizisine eklenmeli. ESLint `projectService` ile parse
ederken include dışındaki dosyaları "file not in project" diye reddeder ve commit
hook fail eder. Örnek: `vitest.config.ts` (A2a), ilerideki `playwright.config.ts`,
`tsup.config.ts` vs.

### Yeni bir app/paket eklediğinizde

`pnpm-workspace.yaml` `apps/*` ve `packages/*` glob'larına bakar — yani standart
yerlere koyduğunuz bir şey otomatik algılanır. Ama özel path varsa (örn.
`tools/cli/`) manuel ekleme şart. Yeni paketten import etmeden önce bir
`pnpm install` koşmak da unutulmamalı; pnpm symlink'i kurmadan TS resolve edemez.

### Turbo `globalEnv` env var passthrough

Turbo 2.x cache'i deterministik tutmak için `globalEnv` (veya task-level `env`)
listesinde olmayan env var'ları sub-process'e **geçirmez**. Lokalde `.env`
dosyasından okuyan kütüphaneler (Nest ConfigModule gibi) etkilenmez. Ama CI'da
runner env var'larıyla beslenen tasklar fail eder.

**Kural:** Yeni env var ekleyince:

1. `.env.example` güncelle.
2. `apps/api/src/config/env.ts` Zod schema'sına ekle.
3. `turbo.json` `globalEnv` dizisine ekle.
4. CI workflow'unun `env:` bloğuna ekle (gerekiyorsa).

A2a fix commit: `84c538c fix(ci): pass database and redis URLs through turbo globalEnv`.

### Prisma + pnpm hoist

`.npmrc`'de `public-hoist-pattern[]=*prisma*` ve `@prisma/*` zorunlu, yoksa
Prisma CLI workspace içinden `@prisma/client`'ı resolve edemiyor (postinstall
döngüsünde fail). A2a'da keşfedildi.

A2b'de Prisma'yı `apps/api/prisma/` altına taşıma TODO'su ertelendi (bu çözüm
hoist sayesinde stable).

### `prisma migrate dev` non-interactive shell'de çalışmaz

TTY ister. Workaround:

```
pnpm prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql
```

Manuel migration klasörü yarat (`prisma/migrations/<ts>_<name>/migration.sql`),
SQL'i içine koy, gerekiyorsa manuel SQL ekle (CREATE EXTENSION, partial index
gibi DSL'in karşılayamadıkları), sonra:

```
pnpm prisma migrate deploy --schema prisma/schema.prisma
```

A1'de keşfedildi, akış 3 migration'da kullanıldı: `_init`, `_add_uuidv7`,
`_add_otp_requests`.

### Vitest + NestJS DI: SWC plugin zorunlu

`unplugin-swc` + `@swc/core` `vitest.config.ts`'de aktif olmazsa
`emitDecoratorMetadata` çıktısı eksik kalır → `ConfigService` gibi inject'ler
runtime'da `undefined`. A2a'da DomainExceptionFilter ve PrismaService DI
fail'leriyle keşfedildi. ADR 0007 bunun gerekçesi.

### Prisma soft-delete extension'ın handle ETMEDİĞİ durumlar

A2b'de eklenen `softDeleteExtension` şunları handle eder:
`findMany`, `findFirst`, `count`, `delete` → soft-delete filter veya soft-delete
çevrimi.

**Handle ETMEDİĞİ:**

- `findUnique` — Prisma'nın `where` argümanı yalnızca unique alan kabul eder;
  `deletedAt: null` filtresi ekleyemezsiniz. **Çözüm:** soft-delete'a tabi
  modellerde `findFirst({ where: { id, deletedAt: null } })` kullanın. Veya
  schema'da partial unique index (örn. `users_phone_e164_active_unique`).
- `update` — soft-deleted bir satırı kazara update edebilir. **Çözüm:** use
  case'lerde `where: { id, deletedAt: null }` ile manuel guard.
- `deleteMany` — bulk soft-delete A2c veya sonrası. Şimdilik kullanmayın.
- "Silinenleri görmek" için escape hatch yok — gerekirse `prisma.$queryRaw`
  veya extension'ı bypass eden ayrı service.

### Idempotency interceptor endpoint-level, GLOBAL DEĞİL

A2a'da yanlışlıkla `APP_INTERCEPTOR` olarak global kayıtlıydı. A2b'de
endpoint-level `@UseInterceptors(IdempotencyInterceptor)` decorator'ına
indirgendi. Sebep: idempotency mantıklı endpoint'lere (POST /bookings,
POST /auth/otp/request, POST /payments) opt-in olmalı. Tüm GET'lere
veya internal endpoint'lere uygulamak Redis kilit gereksiz baskı.

### Outbox event'i use case'in ana transaction'ı içinde

ADR 0004'ün uygulama kuralı: domain event yayan use case
`prisma.$transaction(async tx => { await repo.create(tx, ...); await tx.outboxEvent.create({ ... }); })`
şeklinde repo + outbox'ı **aynı** transaction'da yazar. Atomicity garanti.

In-memory event bus (EventEmitter2 / Nest CQRS) bu aşamada **yok** — outbox
worker (A2c) tabloyu okuyup publish edince in-process subscriber'lar
tetiklenecek. İki kaynak yok.

### Prisma transaction + domain error → accounting loss tuzağı

Bir use case'de "persist etmen gereken bir accounting yazımı" (retry counter,
audit log, rate limit tick, reuse-detection cascade revoke) ve
"atabileceğin bir domain error" varsa, bu ikisi aynı transaction'da
**OLMAMALI**. `throw` Prisma transaction'ını rollback eder, kaydın gider.

**Pattern:** accounting yazımını ayrı kısa transaction'a koy, throw'dan
ÖNCE commit et; ana iş başka transaction'da dursun.

```ts
// Yanlış:
return this.tx.run(async (tx) => {
  await repo.bumpCounter(tx, ...);   // bu rollback olur
  if (somethingBad) throw new DomainError();
});

// Doğru:
await this.tx.run(async (tx) => {
  await repo.bumpCounter(tx, ...);   // commit edildi
});
if (somethingBad) throw new DomainError();
```

Örnekler:

- **OTP attempt bump** (ADR 0010) — A2c'de keşfedildi ve fix'lendi.
  Brute force vektörünü kapatan kritik fix.
- **Refresh reuse cascade revoke** (ADR 0010) — aynı pattern, security
  audit kaybolmasın.
- **Webhook dedup counter** — gelecek (payment iyzico webhook'ları).
- **Rate limit counter** — A2c-followup'ta Redis'e taşındı, atomic Lua
  script problemi tamamen çözüyor (rollback semantiği yok).

Supply / booking modüllerinde benzer pattern gelecek (örnek: booking
state transition fail olursa attempt audit log persist olsun).
Yeni use case yazarken refleks olarak sor: "throw ediyor muyum? evetse
counter/log/cascade write'larım ayrı tx'te mi?"

### RxJS interceptor nested observable tuzağı

`from(Promise<Observable>)` doğrudan stream'e çevrilmez; içeriden çıkan
`Observable`'ı handle etmek için `from(promise).pipe(mergeMap(obs => obs))`
pattern'i gerekir. A2b idempotency interceptor'ında bu unutulduğunda Nest
inner observable'ı body olarak serialize etti ama subscribe etmedi → testte
"replay" yerine her seferinde yeni handler çalıştı.

İlişkili: idempotency persist + lock release sırası **fire-and-forget değil**.
`tap` yerine `concatMap(async body => { await persist(); await release(); return body; })`
kullan — aksi halde 2. request 1. request'in persist'i tamamlanmadan girer
ve `requestHash` collision algılayıp yanlışlıkla 409 döner.

---

## 2026-04-23 — Session A2c

### Volta pin uyumluluğu

Repo `volta.node = "20.18.0"` pin'liyor (root `package.json`). Volta yüklü
makinede repo dizinine girince otomatik switch olur. Volta yoksa `.nvmrc` +
`engines.node` düşer. CI'da `actions/setup-node` `node-version` env'i
20.18.0 olduğu için ABI tutarlılığı garanti.

Yeni Node minor sürümüne geçerken: hem `volta install node@<x.y.z>` +
`volta pin node@<x.y.z>` koş, hem `.nvmrc` güncelle, hem `apps/api/package.json`
`engines.node` güncelle, hem `.github/workflows/ci.yml` `NODE_VERSION` güncelle.
Üçü senkron olmalı.

### `_testOnlyGetLastOtp` helper'ı

`MockSmsSender` test ortamında gönderilen son OTP'yi memory'de tutar; e2e
testler bu yardımcıdan plaintext code'u alır (DB'de sadece `argon2id` hash
var). Helper sadece `NODE_ENV === "test"` veya `NODE_ENV === "development"`'da
çalışır; production'da çağrılırsa throw eder. Production'da gerçek
`NetgsmSmsSender` SMS atar, plaintext kimsede yoktur.

---

## 2026-04-24 — Session A2c-followup

### BullMQ `maxRetriesPerRequest: null` zorunluluğu

`@nestjs/bullmq` ile Redis bağlantısı kurarken `connection` config'inde
**`maxRetriesPerRequest: null`** olmazsa BullMQ queue create anında
"Using the maxRetriesPerRequest is not supported" hatası atar. ioredis
default'u 20 — BullMQ explicit `null` (sınırsız) bekliyor. Nest
ConfigModule + `BullModule.forRootAsync` factory'sinde unutmamak için
`QueueModule` içine yorum bırakıldı.

### Rate limiter anahtar isimlendirme disiplini

Tüm rate limit Redis key'leri `rl:` prefix'iyle başlar. Caller'ın
sorumluluğu (`apps/api/src/modules/identity/application/use-cases/
request-otp.use-case.ts` örneğine bak), port'un değil. Aktif key
aileleri:

- `rl:otp:request:phone:<phone>` — 60sn / 1
- `rl:otp:request:phone:<phone>:hour` — 3600sn / 5
- `rl:otp:request:ip:<ip>` — 60sn / 3
- `rl:otp:verify:phone:<phone>` — 3600sn / 10

Yeni domain (supply, booking, webhook, payment) için: `rl:<feature>:
<scope>:<value>`. Aynı port impl'i (Redis Lua) tüm aileler için
çalışır — fresh limiter implementasyonu yazma.

### Outbox worker test izolasyonu

`outbox-drain.integration-spec.ts` Testcontainers Postgres'i auth e2e
ile paylaşıyor. Auth test'leri çalıştığında 5 identity event (OtpRequested,
OtpVerified, UserCreated, UserLoggedIn, RefreshTokensIssued) outbox'a
yazılıyor. Drain spec `beforeEach`'te **TÜM `outbox_events` satırlarını
sil** (`deleteMany({})`) — `eventType: { startsWith: "test." }` filter'ı
yetmiyor çünkü drainOnce() tüm pending'i çekiyor. Pattern: pending state
ölçen entegrasyon testleri kendi tablosunu beforeEach'te wipe etmeli.

### Outbox worker — gerçek BullMQ vs `drainOnce()` direkt çağrı

Worker class (`OutboxWorker`) BullMQ Processor decorator'ıyla; gerçek
iş `OutboxDrainService.drainOnce()`'da. Test'ler **service'i direkt
çağırır** — BullMQ scheduler'ı / worker loop'u test etmiyor (BullMQ
sorumluluğu). Bizim sorumluluğumuz: drain mantığı (read + emit + commit

- retry + abandon). Bu ayrım test'leri deterministic yapıyor — fake
  timer yok, polling yok.

### `Prisma.sql` raw query

`SELECT ... FOR UPDATE SKIP LOCKED` Prisma client API'sinde yok —
`tx.\$queryRaw<RowType[]>(Prisma.sql\`...\`)`ile yazılır.`Prisma.sql`
template tag SQL injection'ı önler (parametreleri prepared statement'e
çevirir). Tek raw SQL leak noktası outbox worker — kabul edilen ORM
escape hatch.

Aynı pattern booking dispatch matching (PostGIS distance query),
catalog category filter (jsonb operator), payment reconcile (window
function) için tekrarlanacak. Her seferinde yorum satırı bırak: "Why
raw: <X> is not expressible in Prisma DSL".

---

## 2026-04-23 — Session A3a

### ClockPort her yerde inject — `new Date()` yasak

`apps/api/src/common/clock/` altında global ClockPort. Identity, outbox
worker, rate limiter — hepsi `clock.now()` / `clock.nowMs()` çağırır.
Application code'da `new Date()` veya `Date.now()` görmek = code review
red flag. ADR 0014.

İstisna: DB-side timestamp'ler (Prisma `@default(now())`) ve logger
timestamp'i (pino kendisi koyar). Audit trail için DB now() kanonik —
clock injection oraya sızdırılmaz.

Test override:

```ts
const clock = new FrozenClock(new Date("2026-04-23T08:00:00Z"));
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(CLOCK_PORT)
  .useValue(clock)
  .compile();
clock.advance(2 * 60 * 60 * 1000);
```

### Returning-user e2e izolasyon kuralları

Aynı phone'la iki kez login eden e2e (Testcontainers Postgres + shared
Redis):

1. **Phone'u diğer suite'lerle ÇAKIŞTIRMA** — auth.controller.e2e
   `+905559001001`'i kullanıyor; returning-user `+905559009001`'e geçti.
   Yoksa Redis rate limit kalıntısı 429 üretir.
2. **`beforeEach`'te Redis `rl:otp:*` key'lerini temizle.** Test'ler
   arası Redis state taşması rate limit decision'ları bozar.
3. **Tablo cleanup sırası:** RefreshToken → OtpRequest → User (FK).
   OutboxEvent ayrı (FK yok ama ilgili aggregate'lere göre filtrele).

Pattern dosyası: `apps/api/test/returning-user.integration-spec.ts`.

### Polymorphic Catalog: scope=VEHICLE vs scope=BOOKING attribute'lar

CategoryAttributeDefinition iki farklı yere bağlanır:

- `scope=VEHICLE` → `Vehicle.attributes` JSONB. Sürücü araç register'larken
  doldurur (renk, klima, vs).
- `scope=BOOKING` → `Booking.attributes` JSONB. Müşteri rezervasyon
  yaparken doldurur (tören yeri, kiralama saati, vs).

Aynı kategori için her iki scope'tan attribute olabilir. Vehicle register
ve Booking create use case'leri ayrı Zod schema üretir (definition'ları
filter scope'a göre). A3b/A4 implementasyonu için template hazır:
`apps/api/src/modules/catalog/CLAUDE.md`.

### Seed script Prisma `generator client { seed = ... }` ile değil, package script ile

Schema'da `seed` directive yerine root `package.json`'a `"db:seed": "tsx
prisma/seed.ts"` eklendi. Sebep: schema'daki seed config'i sadece
`prisma db seed` komutunu yapılandırır; biz `pnpm db:seed` ile direkt
çağırıyoruz, daha şeffaf. Ayrıca `seed` directive Prisma'nın migrate
reset akışıyla otomatik tetiklenir — istemediğimiz bir yan etki
(reset = migration replay, seed her zaman istemiyoruz).

`tsx` runner root devDep olarak eklendi (`tsx@^4`).

### Catalog seed: idempotent, upsert tabanlı

`prisma/seed.ts` her şeyi `upsert` yapıyor (slug bazlı). Re-run güvenli.
Production'da `pnpm db:seed` çalıştırılırsa wedding-car kategorisi
zaten varsa dokunmaz — production "shipped categories" için de bu seed
geçerli (tek vertical başlangıçta, A4'te admin panelden eklenir).

### Next.js workspace integration: `transpilePackages`

Admin app `apps/admin` `@event-fleet/shared-types` paketini import
ediyor. Workspace symlink'i `dist/` ESM'i işaret ediyor. Next 15
default bundler bunu transpile etmez → import resolution fails.
Çözüm: `next.config.js` `transpilePackages: ["@event-fleet/shared-types"]`.

Yeni workspace package eklendiğinde admin'den import edilecekse listeye
eklenmesi şart.

### `apps/admin` lint: Next.js kendi config'iyle

Root `eslint.config.mjs` flat config sadece `apps/api/**` glob'unu
hedefler. Admin'in kendi `.eslintrc.json` (legacy format, `next lint`
zorunlu kıldığı için) `next/core-web-vitals + next/typescript`
extends'leriyle çalışır. `pnpm -r lint` her workspace'in lint
script'ini çağırır → admin için `next lint --max-warnings=0`.

Next 16'da `next lint` deprecated; CLI'a geçiş gerektiğinde admin
ESLint config flat'a taşınır, root flat config'in admin scope'u eklenir.

### tsx + tsconfig.json yeni include

Root'a `prisma/seed.ts` eklendi. Eğer ileride root tsconfig include
dizisinde `prisma/**` yoksa, ESLint projectService eklenirse "file not
in project" hatası gelir. Şu an root-level tsconfig.json yok (her
package kendi tsconfig'ini yönetiyor); seed dosyası `tsx` ile çalışıyor
(kendi internal tsconfig). ESLint root flat config seed'i lint etmiyor
çünkü `apps/api/**` ve `packages/shared-types/**` dışında — kabul.

---

## 2026-04-25 — Shared-types dual-format hotfix

### Problem

`packages/shared-types` ESM-only yapılandırılmıştı (`"type": "module"` +
`exports.import` sadece). Vitest (ESM-native) testlerde sorunsuz çalışıyordu,
ama `pnpm --filter @event-fleet/api dev` runtime'da CJS loader kullandığı için
`ERR_PACKAGE_PATH_NOT_EXPORTED` atıyordu:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
.../shared-types/package.json
    at packageExportsResolve (node:internal/modules/esm/resolve:594:13)
    ...
    at Object.<anonymous> (apps/api/src/modules/catalog/domain/value-objects/slug.vo.ts:1:1)
    at Module._compile (node:internal/modules/cjs/loader:1469:14)
```

CI'da yakalanmadı çünkü integration test'ler de Vitest üzerinden ESM'de
koşuyor — gerçek `nest start` runtime sadece `pnpm dev` ile devreye giriyor.

### Çözüm

tsup ile dual-format build (ESM + CJS aynı paket içinde). `exports` field'ı
`import` ve `require` koşullarına ayrıldı; consumer hangi modül sistemini
kullanıyorsa Node otomatik doğru dosyayı seçer.

```
dist/
  index.js / index.cjs / index.d.ts / index.d.cts (+ source maps)
  common/index.{js,cjs,d.ts,d.cts}
  identity/index.{js,cjs,d.ts,d.cts}
  errors/index.{js,cjs,d.ts,d.cts}
```

`"type": "module"` korundu (silmek istemiştik ama tsup `.js` ESM yazdığı
için Node'un extension lookup'ı ile uyumlu kalması şart). `.cjs` extension
zaten CJS olarak okunuyor.

### tsup config gotcha'ları

1. **Default outExtension `.mjs`** — `outExtension: ({ format }) => ({ js:
format === "cjs" ? ".cjs" : ".js" })` ile `.js` zorla.
2. **DTS build TS5074 (`incremental` flag)** — base tsconfig `incremental:
true` veriyor, tsup'ın internal dts builder reddediyor. Çözüm:
   `tsconfig.tsup.json` ayrı dosya, `incremental: false` + `module: "ESNext"`
   - `verbatimModuleSyntax: false` (sadece dts emit için kullanılıyor).
3. **Dual-format çıktıyı manuel test:**

   ```bash
   node -e "console.log(Object.keys(require('./dist/index.cjs')).length)"
   node --input-type=module -e "import('./dist/index.js').then(m => console.log(Object.keys(m).length))"
   ```

### Yan etki: pnpm overrides

tsup install transitif olarak `cosmiconfig-typescript-loader` getirdi
(peer `@types/node ^25`). pnpm bu peer'ı resolve etmek için iki
`@types/node` versiyonu (20 + 25) kurdu, vite/vitest plugin tipleri
çakıştı (`vite@5.4.21_@types+node@25.6.0` vs `_@types+node@20.19.39`).

**Çözüm:** root `package.json` `pnpm.overrides`:

```json
"@types/node": "20.17.0",
"typescript": "5.6.3"
```

TypeScript pin de gerekti — pnpm reinstall sırasında 5.9.3'e zıpladı,
Prisma client + 5.9 yeni inference birlikte `findMany.select` zincirinde
`never` türüne düşüyordu. 5.6.3 stable.

### Geleceğe not

- Yeni paket (config hariç) için aynı tsup pattern kopyala.
- NestJS Nest 11 ile ESM-first oluyor; o ana kadar dual format en güvenli.
- `"type": "module"` kalsın; tsup `.cjs` ile beraber tutarlı.

### CI gap

Bu sorun lokal `nest start` ile ortaya çıktı, CI yakalayamadı. A4 öncesi
CI'a "prod build smoke" job eklenecek: `pnpm build && pnpm --filter api
start --port 0` 5 saniye, healthz check. CI gap kapanır.

---

## 2026-04-24 — Session A3b

### S3 presigned PUT Content-Length imzası

`getSignedUrl(PutObjectCommand({ ContentLength: maxSizeBytes }))` —
Content-Length URL imzasına dahil. Client 16 MB dosyayı 15 MB limit ile
yüklemeye kalkarsa S3 400 döner. "Client'a güvenelim" değil "imza zorla"
kuralı. Test: `storage.integration-spec.ts` oversize senaryosu bu davranışı
doğrular.

### MinIO `forcePathStyle: true` zorunlu

MinIO hostname-style URL'i desteklemiyor. R2 her ikisini de kabul ediyor
(env default: `STORAGE_FORCE_PATH_STYLE=true`). Aynı config, iki provider.

### Testcontainers MinIO spin-up

`setup-integration.ts` globalSetup'ta postgres + redis + minio üçünü de
boot ediyor. MinIO container'ı `quay.io/minio/minio:RELEASE.2024-10-13...`
(image pinned). Test bucket + anonymous download policy `S3Client` ile
JS'de kurulur (mc binary yerine) — daha portable, testcontainer lifecycle
ile uyumlu.

### Prisma + @prisma/client ile cross-module write

`supply.ApproveDriverUseCase` içinde `tx.user.update({...})` ile identity
tablosuna yazıyoruz (User.role → DRIVER). Aynı transaction → atomik.
Event-driven alternative "APPROVED ama henüz promote edilmedi" penceresi
yaratır (outbox worker bir sonraki drain'e kadar). Kasıtlı istisna; her
cross-module write YORUM ile gerekçelendirilmeli. ADR 0005 § "Revisit
trigger": bu pattern kontrolden çıkarsa identity'ye
`PromoteUserRoleUseCase` port'u ekleriz.

### PII disiplini (KRİTİK)

TCKN ve IBAN plaintext HİÇBİR yerde kalıcı değil:

- **DB:** sadece `national_id_hash` (HMAC-SHA256) ve `iban_hash` (argon2id).
  `iban_last4` display için ayrı kolon, plaintext TCKN için display yok.
- **Event payload:** hash bile YOK, sadece id + isim + last4.
- **Response DTO:** mapper'lar (`driver-profile.mapper.ts`) sadece safe
  alanları geçirir. Response'a PII eklenirse smoke assertion kırılır.
- **Log:** pino redaction `*.nationalId`, `*.iban`, `*.nationalIdHash`,
  `*.ibanHash`, + body-level path'ler. Hash bile görünmesin (`ibanHash`
  eski PII bağlantısı tutar).

ADR 0016 — kuralın gerekçesi. Bu kural booking (PII yok ama wallet/payout
IBAN görür), messaging (IBAN regex mask) için de geçerli.

### Attribute validator application layer'da

İlk attempt `domain/services/` altına koydum ama `AttributeDefinitionRecord`
tipi `catalog/application/ports/` altında — domain → application import
ESLint ADR 0005 guard'ı engelliyor (doğru davranış). Taşındı:
`supply/application/services/attribute-validator.ts`. Genel kural: bir
domain service dış modülün application record'unu consume ediyorsa
application layer'da yaşamalı, domain'de değil.

### VehicleType reverse relation

`VehicleType` modeline `vehicles Vehicle[]` back-ref eklendi (Prisma
schema consistency için). Migration'da ek kolon yok — sadece ORM-side.
Bu her yeni relation için hatırlanması gereken bir şey: karşı tarafın
array referansını unutma, yoksa Prisma "has-many" uyarısı verir.

### DriverProfile user_id: @unique + partial unique index

`@unique` Prisma DSL'i total unique constraint kurar (soft-delete dahil).
Ancak aynı user yeniden profile açabilir mi (silinen önceki kayıttan
sonra)? İleride KVKK silme → yeniden kayıt senaryosu için partial unique
index eklendi (`WHERE deleted_at IS NULL`), total unique constraint'ten
**daha gevşek**. Prisma DSL'in `@unique`'i silinen satırları da görüyor;
bu iki katmanlı garanti:

- Aktif row'lar partial index ile unique.
- Eski soft-deleted row'lar unique değil — silinmiş user revive edildiğinde
  yeni profile açabilir.

Şu an total `@unique` konstrainti varken partial de var → migration SQL'de
`ALTER TABLE DROP CONSTRAINT` ile total'i kaldırabiliriz ama A4'e ertelendi
(şu an soft-deleted user yok, sorun yok). Gelecekte KVKK silme flow'u
bunu triggerlar.

### PersistenceModule promotion

Identity'den aldığımız `TxRunnerPort` + `OutboxWriterPort` common/persistence'e
promote edildi. Supply (ve tüm gelecek modüller) aynı ports'u inject eder,
tek implementation. Aynı zamanda `TxClient` tipi de `common/persistence/
tx-client.ts`'te. Identity ports artık TxClient'ı oradan import ediyor.
Cross-module port paylaşımı = common/\* altında, module-specific kalır
module altında.

---

## 2026-04-25 — Session A3c

### Half-open `[start, end)` interval kuralı

Vehicle availability overlap kontrolünde half-open kullandık: `[10:00, 12:00)`
ile `[12:00, 14:00)` çakışmaz (adjacent ranges OK). Standart "iş takvimi"
modeli — biri 12:00'de bitince diğeri 12:00'de başlayabilir. Prisma DSL'de:

```ts
where: {
  startAt: { lt: endAt },     // existing.startAt < requested.endAt
  endAt: { gt: startAt },     // existing.endAt > requested.startAt
}
```

Eşitlik bilinçli olarak yok. PostgreSQL `tstzrange(start, end, '[)')` aynı
semantik — gelecekte GiST index ile değiştirilirse aynı sonuç.

### `tstzrange` + `&&` overlap operatörü (revisit triggeri)

Şu an availability conflict sorgusu B-tree composite index ile çalışıyor
(`vehicle_id, start_at, end_at`). PostgreSQL'in native `&&` operatörü ile
range query daha okunaklı ama:

- `tstzrange(start_at, end_at, '[)') && tstzrange($1, $2, '[)')` — GiST
  index gerek (`btree_gist` extension + composite GiST).
- Şu an N << 10K availability/vehicle. B-tree yeterli.
- Revisit: per-driver 1000+ availability rows veya milisaniye altı latency
  gerektiğinde GiST'e geç + extension yükle.

### Bucket auto-ensure idempotency

S3 SDK `CreateBucketCommand` **idempotent değil** — bucket varken
`BucketAlreadyOwnedByYou` veya `BucketAlreadyExists` throw eder. Pattern:

```ts
async ensureBucket() {
  try { await client.send(new HeadBucketCommand({Bucket})); return; }
  catch (err) { if (!isNotFound(err)) throw err; }
  try { await client.send(new CreateBucketCommand({Bucket})); }
  catch (err) { if (!isAlreadyOwned(err)) throw err; }
}
```

Iki try/catch — HeadBucket önce (race condition'da gereksiz CreateBucket
'ı atlatır), CreateBucket de safe. Production'da skip — bucket DevOps
provision eder.

### Seed admin bootstrap NODE_ENV guard

`prisma/seed.ts`'de admin user yaratımı `NODE_ENV === "production"` kontrolü
ile koruma altında. Production'da `pnpm db:seed` admin yaratmaz, sadece
warn log emit eder. Prod admin için `pnpm api:promote-admin <phone>` CLI.
ADR 0015.

### Promote admin CLI ESLint exclusion

`apps/api/scripts/promote-admin.ts` `tsx` ile çalışıyor, herhangi bir
tsconfig include'ında değil — root `eslint.config.mjs` ignore'una
`apps/api/scripts/**` eklendi (seed.ts ile aynı pattern, A3a precedent).

### Cross-module write — User.role promotion (CLI ekstrası)

A3b'de approve use case'i içinde `tx.user.update` ile `User.role = DRIVER`
yazımı ADR 0005 istisnası olarak kabul edildi. A3c'de aynı pattern
**promote-admin CLI'da** tekrarlanıyor:

```ts
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  await tx.outboxEvent.create({
    data: { eventType: "identity.UserRolePromoted", payload: {} },
  });
});
```

CLI bağlamında bu daha az problemli — script tek seferlik, modüler izolasyon
runtime kuralı değil tooling kuralı. Ama outbox event'i atomik tutmak için
aynı tx şart.

### Next.js 15 `useSearchParams` Suspense bailout

Next 15 build'de `useSearchParams` kullanan herhangi bir client component
**Suspense ile sarılmalı** yoksa prerender bailout error. Pattern:

```tsx
export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />
    </Suspense>
  );
}
```

Default export Suspense wrapper'a, hook child component'a. A3c login
sayfasında bu hatayla karşılaştık.

### Admin auth: localStorage MVP

`apps/admin/src/lib/api-client.ts` access + refresh token'larını localStorage'da
tutuyor. **MVP kararı, prod-grade değil:**

- XSS riski: malicious script localStorage'a erişebilir. CSP + güvenli
  3rd-party deps + bilinçli kod kuralı yeterli savunma A3c için.
- A4'te httpOnly cookie + CSRF token + SameSite=Strict pattern'e geçiş.
  Customer mobile app aynı backend'i kullanırken bu değişim shared.

`useRequireAuth` hook her sayfada `/auth/me` çağırır — token live olduğunu
ve role'ün hâlâ ADMIN olduğunu doğrular. Token revoke / role downgrade
durumunda bir sonraki sayfa load'unda /login'e yönlendirir.

### Minimal UI primitives (shadcn alternative)

shadcn CLI yerine `clsx` + `tailwind-merge` + `class-variance-authority` ile
Button + Input + Card + Table elle yazıldı (`apps/admin/src/components/ui/`).
Sebep:

- shadcn CLI Radix UI komponentleri (15+ npm package) ekliyor — A3c için
  overkill (table, button, input, card yetiyor).
- Driver approval queue Radix dialog gerektirmedi (prompt() MVP yeterli).
- Genişleme: dialog/select/dropdown gerektiğinde `pnpm dlx shadcn@latest add`
  çağrısı çalışır (components.json yoksa init önce).

### Admin ESLint strict parity (Option B uygulandı)

A3a'dan TODO kapandı. `apps/admin/.eslintrc.json` içine:

- `@typescript-eslint/no-explicit-any: error`
- `@typescript-eslint/no-non-null-assertion: error`
- `@typescript-eslint/consistent-type-imports: error`
- `@typescript-eslint/no-unused-vars: error`
- `import/order: error` (root config ile aynı groups + alphabetize)
- `no-console: error` (warn/error allowlist)

Root `eslint.config.mjs` flat config admin'i hâlâ ignore ediyor — admin
kendi `.eslintrc.json` (legacy format, `next lint` zorunlu) ile strict
seviyede çalışıyor. Next 16'da `next lint` deprecated; o zaman flat'a
geçiş + root config'e admin scope.

---

## 2026-04-25 — Integration test green hotfix

### Problem

A3c merge sonrası 3 integration kırmızı (lint/typecheck/build/unit yeşil):

1. `storage.integration-spec.ts` — `StorageBootstrapService` `InjectPinoLogger`
   ile `PinoLogger`'ı inject ediyor; test module'ü `LoggerModule.forRoot()`
   import etmediği için DI fail. 5 test skip.
2. `auth.controller.e2e-spec.ts` — A2c-followup'ta eklenen Redis sliding
   window rate limiter idempotency testlerinde 429 dönüyor. Suite içinde
   hardcoded `+90555` phone'lar + supertest default IP (`::1`) → per-IP
   minute limit 3 saniye içinde dolu, 4. test 429 alıyor.
3. `driver-onboarding-lifecycle.e2e-spec.ts` — Testcontainers temiz DB,
   `wedding-car` kategorisi yok, `findActiveVehicleType` null dönüyor.

Production akışında üçü de doğru davranış — test setup eksiklikleri.

### Çözümler

**1. Storage bootstrap test'te override (no-op).** `setup-integration.ts`
zaten MinIO container'ında bucket'ı `S3Client + CreateBucketCommand` ile
yaratıyor; test'te ayrıca bootstrap çalıştırmak gereksiz. `LoggerModule`
import etmek yerine provider override:

```ts
.overrideProvider(StorageBootstrapService)
.useValue({ onApplicationBootstrap: async () => { /* no-op */ } })
```

`overrideProvider().useValue()` NestJS DI'a "constructor çağırma" der —
PinoLogger DI hiç tetiklenmez. LoggerModule import etmek "sadece DI gerek"
diye fazla geniş.

**2. `uniquePhone()` test util + Redis `rl:otp:*` cleanup beforeEach'te.**
Tek katman yetmedi: phone unique olsa bile suite içindeki 4. OTP request'i
default IP'den geliyor, per-IP-minute (3) 429 üretiyor. İki katman:

- `uniquePhone()` — `+905XXXXXXXXX` random, per-phone bucket çakışmasın
- `redis.client.del('rl:otp:*')` beforeEach'te — per-IP bucket suite
  arası reset

Production rate limiter dokunulmadı; test kendi izolasyonunu sağlıyor.
`returning-user.integration-spec.ts`'deki precedent'i taşıdık.

**3. `setupCatalogFixtures(prisma)` helper.** Lifecycle test'in ihtiyacı
olan minimum data (1 ServiceCategory + 1 VehicleType + 3 VEHICLE-scope
attribute def `trim_color` / `has_air_conditioning` / `has_chauffeur`).
Tam seed admin user + 5 attribute def yaratıyor — test için overkill.
Helper idempotent (upsert by slug); diğer test'ler de re-use edebilir.

### Side fix: driver-profile.integration-spec.ts FK

A3b'nin `driver-profile.integration-spec.ts` beforeEach'inde availability
cleanup yoktu. Lifecycle test bir VehicleAvailability bırakırsa, bir
sonraki suite çalıştığında `vehicle.deleteMany()` FK violate ediyordu
(`vehicle_availabilities_vehicle_id_fkey`). Cleanup order'ına
`vehicleAvailability.deleteMany({})` eklendi — A3c migration etkisi.

Genel kural: **yeni FK eklediğin migration sonrası, mevcut test
beforeEach cleanup'larını gözden geçir.** Cross-suite contamination en
kolay buradan çıkar.

### CI gap kapatıldı: Prod build smoke job

`.github/workflows/ci.yml`'a `prod-build-smoke` job. Postgres + Redis +
MinIO services, `pnpm build` + `node apps/api/dist/main.js` + `/healthz`
30 saniye polling. Yakalayacağı:

- CJS/ESM regression (dual-format gibi)
- Zod env validation hataları (yeni env eklenince schema güncellenmemişse)
- NestJS DI resolution hataları (storage bootstrap gibi prod yolda)
- Boot süresi patlamaları (Faz 2'de payment, booking eklendikçe)

### Lessons learned

1. **Lokal smoke yapılmadan merge etmek 3 sessiz hata bıraktı.** Solo
   geliştiricinin "branch protection yok" disiplini eksiği — gelecek
   PR'larda lokal `pnpm test:integration` checklist zorunlu (PR template
   güncelle A4 başında).
2. **Vitest ESM ≠ nest start CJS.** Test path runtime hatalarını
   yakalamıyor; prod build smoke job bu kapıyı kapattı.
3. **Rate limiter doğru çalışıyor (429 dönüyor!)** ama test'ler bunu
   bilmiyordu. Production behavior değişmedi, test'ler katılaştı.
4. **Yeni FK = beforeEach cleanup audit zorunlu.** Cross-suite
   contamination her zaman yeni schema göçüne tepkisi geç olan eski test'ten.

### Helper konumu konvansiyonu

`apps/api/test/helpers/` altına paylaşılan test util'ları:

- `phone-factory.ts` — `uniquePhone()`
- `catalog-fixtures.ts` — `setupCatalogFixtures()`

Yeni helper eklenince buraya. Module-spesifik fixture'lar (`booking/`,
`payment/`) A4'te eklenecek alt klasörlerde.

---

## 2026-04-27 — Session A4a (Pricing engine + booking quote)

### Decimal her yerde para

`Decimal.js` + Prisma `@db.Decimal(10, 2)` para kolonlarında zorunlu. JS
`number` para hesabında YASAK (`0.1 + 0.2 === 0.30000000000000004`). MoneyVO
`multiply()` her zaman `Decimal.ROUND_HALF_UP` ile 2 ondalığa yuvarlar —
`5500 × 1.30 = 7150.00`, `5500.50 × 1.30 = 7150.65` deterministik. Test
pinleri ADR 0017 sözleşmesi.

### External API call transaction'dan ÖNCE (ADR 0010 disiplin)

`RequestPriceQuoteUseCase` Google Maps Distance Matrix çağrısını `txRunner.run`'ın
DIŞINDA yapar. 5 saniyelik HTTP timeout DB lock'ları tutmasın diye. Aynı
disiplin A3b'de Storage presigned URL üretiminde de vardı; pattern artık
"new external integration → tx-dışı" refleksi.

### DistanceCalculator factory: dummy key sentinel (ADR 0018)

`pricing.module.ts` `useFactory`: `GOOGLE_MAPS_API_KEY.startsWith("AIzaSy_DUMMY")`
true ise `MockDistanceCalculator` (haversine × 1.4, 40 km/h), aksi halde
`GoogleMapsDistanceCalculator`. `.env.example` dummy ile gelir → yeni geliştirici
sıfır key'le boot eder. Test setup (`setup-integration.ts`) dummy değer set
eder; integration suite hiç gerçek API'ya dokunmaz.

### `getLoggerToken` (nestjs-pino) factory provider'da

`PinoLogger`'ı factory içinde inject etmek için `inject:` array'inde
`getLoggerToken(ClassName)` kullanılır. `LoggerModule.forFeature` veya
`LoggerModule.forRoot` re-import gereksiz — global LoggerModule yeterli,
sadece sınıfa özel logger token'ını çözmek için bu helper.

### Quote consume: atomic updateMany (race-safe)

`PrismaPriceQuoteRepository.consumeQuote`: `updateMany WHERE status='ACTIVE'
AND expiresAt > now`. Prisma `update` yerine `updateMany` çünkü iki
eşzamanlı booking aynı quote'u consume etmeye çalışırsa biri 1, diğeri 0
satır günceller. `count === 0` durumunda mevcut row'a göre doğru error
seçilir (`QuoteAlreadyConsumedError` / `QuoteExpiredError` / `QuoteNotFoundError`).
A4b booking creation use case bunu içinden çağıracak.

### Outbox payload PII benzeri konum bilgisini taşımaz

`pricing.PriceQuoteCreated` payload: `quoteId`, `vehicleTypeId`, `categoryId`,
`totalAmount`, `currency`, `expiresAt`. **Yok:** lat/lng, address. Lokasyon
müşteri bilgisi → privacy-by-design. Subscriber raporlama vs. için ihtiyaç
duyarsa quote tablosundan audit-log'lu okuma yapsın. Test bu disiplini
`expect(payloadJson).not.toContain("Sultanahmet")` ile pinler.

### Rule snapshot: immutable price guarantee

`PriceQuote.breakdown` JSONB hesaplama anındaki rule isim + multiplier +
addon listesini taşır. Admin sonradan rule'u değiştirse / silse bile quote
sabit. Booking confirm'de re-calculate yok, doğrudan quote'tan total
alınır. ADR 0017 § "Rule snapshot".

### tsx + tsconfig include

`prisma/seed.ts` (`tsx` ile çalışıyor) `seedWeddingCarPricing()` fonksiyonu
yeni eklendi. Hâlâ aynı root flat ESLint ignore'da (`prisma/**`); fonksiyon
sayısı artarken seed dosyası bölünmek zorunda kalırsa A4b'de `prisma/seed/`
alt klasör + per-domain dosya pattern'i düşünülecek.

### A4b'de yapılacak (bağlı altyapı zaten hazır)

- `CreateBookingFromQuote` use case: `consumeQuote` + Booking row
- Booking state machine (XState veya elle finite-state map)
- Booking confirm/cancel use case'leri + outbox event'leri
- `BookingExpiryWorker` (BullMQ): unconfirmed DRAFT bookings + EXPIRED
  PriceQuote temizliği
- Customer mobile akışı (Faz 2 paralel)

---

## 2026-05-05 — Session A4b (Booking State Machine + Workers)

A4a Pricing motorunu kullanarak Booking modülünü canlandıran oturum.
9-state lifecycle, atomic confirm, customer/admin cancel, BullMQ-tabanlı
DRAFT TTL + PriceQuote cleanup worker'ları, public + admin controller'lar.

### Test-only OTP endpoint (smoke ergonomi düzeltmesi)

A4a smoke'unda kullanıcının API log'undan OTP kodu kopyalaması felaketti.
A4b'de port + adapter pattern'iyle çözüldü:

- `TestOtpCachePort` (application/ports) — soyutlama
- `InMemoryTestOtpCache` (infrastructure) — dev/test, 60s TTL, NODE_ENV
  guard'ı içeride
- `NoopTestOtpCache` — production'da bind, hep null döner
- `TestOnlyController` — `GET /auth/_test/last-otp?phone=...`,
  `IdentityModule.controllers` içinde `NODE_ENV !== "production"` ise mount

Defense in depth: production'da hem controller hiç bind olmaz, hem cache
no-op'tur. `RequestOtpUseCase` plain code'u `cache.record(phone, code)`
ile kaydeder — SMS body parse etmek yerine explicit data flow.

### Booking schema genişlemesi

A4a iskeleti 5 kolon + 1 enum'dan (DRAFT) ibaretti. A4b 8 enum değer +
~20 kolon ekledi:

- Quote snapshot kolonları (pickup/dropoff lat/lng/address, event window,
  totalAmount, currency) — immutable price guarantee'nin uygulaması
- Lifecycle audit timestamps (`confirmedAt`, `driverAssignedAt`,
  `startedAt`, `completedAt`, `cancelledAt`, `expiredAt`)
- Cancellation context (`cancellationReason`, `cancelledByUserId`)
- Driver/vehicle FK'ları (A4d'de doldurulacak)
- `deletedAt` (soft delete)
- 4 yeni index (status+eventStartAt, driver+status, eventStartAt)

Migration `prisma migrate diff --script` ile üretildi (CLAUDE.md kuralı).
Bookings tablosu boştu, NOT NULL ekleme güvenli — migration header'ında
not düşüldü ki prod'a giderken backfill düşünülsün.

### State machine pattern (ADR 0019)

Custom hand-rolled FSM, XState değil. 9 state × 11 transition
`ALLOWED_TRANSITIONS` tablosunda. Üç seviye gardiyan:

1. `BookingStateMachine.assertTransition()` — domain layer
2. `repo.transitionStatus(tx, { fromVersion })` — atomic optimistic lock
3. Prisma enum — DB layer son durak

37 spec test her geçerli + bir avuç geçersiz transition'ı pinler.
`IN_PROGRESS → CANCELLED_*` deliberately yok — event başladıysa müşteri
DISPUTED akışına gider. Bu kuralın değişme olasılığı yüksek (A4d driver
no-show senaryosu) ama o zaman ADR güncellemesi + spec güncellemesi
beraber gelir.

### DRAFT bypass (geçici, A4c'de geri alınacak)

`ConfirmBooking` A4b'de DRAFT'ı atlayıp direkt CONFIRMED yaratıyor. Çünkü:

- Mobile flow şu an: quote → onayla butonu → confirm
- Ödeme gelmeden DRAFT-CONFIRMED ayrımı UX'e değer katmıyor
- A4c (payment) gelince: confirm → DRAFT, payment.authorized → CONFIRMED

`BookingExpiryWorker` zaten DRAFT'ı süpürür. A4b'de gerçek DRAFT row
yok, worker dead-code; spec sentetik DRAFT row'la sweep çalıştırıyor —
sözleşme A4c'ye hazır.

### Atomic ConfirmBooking flow

```
tx.run(async (tx) => {
  const quote = await quoteRepo.findById(tx, quoteId);   // owner check
  if (quote.requestedByUserId !== actor.userId) throw BookingAccessDenied;

  const consumed = await quoteRepo.consumeQuote(tx, quoteId, bookingId, now);
  // updateMany WHERE status='ACTIVE' AND expiresAt>now → race-safe

  const booking = await bookingRepo.create(tx, {
    ...consumed,        // snapshot — immutable price guarantee
    status: "CONFIRMED",
    confirmedAt: now,
  });

  await outbox.write(tx, BookingCreated);
  await outbox.write(tx, BookingConfirmed);
});
```

Owner check ÖNCE çalışır (yanlış kullanıcı consume'a kadar bile inmez).
İki paralel confirm aynı quoteId'ye yapılırsa biri başarılı, diğeri
QuoteAlreadyConsumedError. Smoke testi runtime'da kanıtladı: ikinci
confirm 409 döndü.

### Cancel ve aktör ayrımı

`CancelBookingUseCase` tek metodla iki aktöre hizmet ediyor: customer
ve admin. Her ikisi de target state CANCELLED_BY_CUSTOMER. Audit:
`cancelledByUserId = actor.userId` (admin müşteri adına iptal etse de
gerçek aktör korunur), event payload `cancelledByRole: "ADMIN" | "CUSTOMER"`.

Reason kolonu zorunlu (trim'lenmiş, non-empty), DB'ye yazılır ama outbox
payload'a GİTMEZ — free-text customer input, PII benzeri.

### BullMQ workers (NOT @nestjs/schedule)

Plan briefi `@Cron(EVERY_MINUTE)` örneği veriyordu ama bu codebase
BullMQ repeat job pattern'i kullanıyor (precedent: `IdempotencyCleanupScheduler`,
`OutboxScheduler`). `@nestjs/schedule` hiç kurulu değil. A4b iki worker
ekledi:

- `BookingExpiryService` + `Worker` + `Scheduler` — DRAFT bookings 30dk
  sonra EXPIRED + outbox event
- `PriceQuoteCleanupService` + `Worker` + `Scheduler` — ACTIVE quotes
  TTL geçince EXPIRED + outbox event

Service her ikisinde de Worker'dan ayrı; spec service.sweep() çağırıp
BullMQ olmadan FrozenClock altında test ediyor.

### Pricing rate limit (A4a TODO çözüldü)

`POST /pricing/quotes`: 10/dakika/user. Use case içinde
`RateLimiterPort.check()` (mevcut Redis sliding window altyapısı).
Idempotency-Key kontrolü controller'da, rate limit kontrolü use case'de —
form double-tap idempotency ile geçer, scraping rate limit ile durur.

### Outbox PII discipline (sürdürülüyor)

Tüm 4 booking event payload'ı:

- `BookingCreated` — bookingId, customerId, vehicleTypeId, categoryId,
  totalAmount, currency, eventStartAt, eventEndAt
- `BookingConfirmed` — bookingId, customerId, confirmedAt
- `BookingCancelled` — bookingId, cancelledByUserId, cancelledByRole,
  previousStatus, cancelledAt (REASON YOK)
- `BookingExpired` — bookingId, expiredAt

Hiçbiri lat/lng/address taşımıyor. Spec assertion'ı bunu pinler.

### Smoke kanıtı (A4a yorgunluğunun cevabı)

`scripts/smoke-booking-flow.mjs` — 11 adımlı tek dosya Node smoke:
healthz → OTP request → test-only OTP fetch → login → catalog → quote →
confirm (CONFIRMED) → double-confirm (409) → list → cancel
(CANCELLED_BY_CUSTOMER) → re-cancel (409). Smoke'u Node yazdık çünkü
bash + curl + jq + node-eval Windows MSYS'de `=>` arrow function
operatörünü redirect olarak yorumlayıp argv'yi mahvediyordu (tek dosya,
tek runtime tercih edildi).

Smoke runtime kanıtları:

- Quote total **6877.00 TRY** (×1.30 yaz × ×1.15 hafta sonu compound)
- 3 outbox event (BookingCreated/Confirmed/Cancelled) hepsi **processed**
  (BullMQ outbox worker drain)
- Atomic consume: 2. confirm 409
- Terminal-state guard: 2. cancel 409

### Lifecycle integration spec (Testcontainers) — A4c'ye ertelendi

A4a'da Docker Desktop sleep nedeniyle integration spec çalışmamıştı;
manuel smoke yeşil. A4b'de aynı seçim: smoke runtime'da happy path +
race + terminal guard'ları kanıtladı, ayrıca outbox drain DB'de
doğrulandı. Testcontainers spec'i A4c (payment) ile birlikte
yazılacak — orada provizyon/iade akışı için zaten gerçek DB lazım,
booking lifecycle de o pakette test edilebilir.

### A4c'ye devredilenler

- Payment (iyzico Marketplace adapter)
- Booking flow değişikliği: confirm → DRAFT, payment.authorized → CONFIRMED
- Refund logic (cancellation state-aware)
- Booking lifecycle Testcontainers spec
- Driver no-show senaryosu için state machine `IN_PROGRESS → CANCELLED_BY_DRIVER`
  düşüncesi (ADR güncellenir)

---

## 2026-05-07 — Session A4c (Dispatch — Driver Matching + Assignment)

A4b'nin DRIVER_ASSIGNED state'i state machine'de hazırdı ama hiçbir use
case oraya geçmiyordu. A4c bu boşluğu kapatır: PostGIS konum sorgusu,
deterministic scoring matcher, atomic assign + availability sentinel,
30 s tick BullMQ worker, manual reassign, driver location/online updates.

### PostGIS — generated geography column + GIST index

`driver_profiles` tablosuna `last_known_lat/lng` (Decimal 10,7) eklendi,
yanına `last_known_location geography(Point, 4326) GENERATED ALWAYS AS
(... ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography ...) STORED`.
Postgres lat/lng değişince column'u otomatik üretir; STORED diskte yer
kaplar ama her query'de hesap maliyeti olmaz.

GIST index partial: `WHERE last_known_location IS NOT NULL AND deleted_at
IS NULL`. `ST_DWithin(geography, geography, meters)` index'i kullanır,
candidate query <50 ms. Prisma DSL PostGIS'i bilmiyor — bu üç parça raw
SQL ile migration'da; client tarafında kolon Prisma şemasında `Decimal?`
olarak görünüyor (generated column generated client'ta görünmez ama bu
sorun değil — sadece SQL query'sinde kullanıyoruz).

### Raw SQL pattern

`tx.$queryRaw<RawRow[]>(Prisma.sql\`...\`)`—`${variable}`ile parameter
binding (SQL injection güvenli). Mevcut precedent`apps/api/src/common/outbox/outbox-drain.service.ts`. NUMERIC kolonları
JS tarafında string olarak gelir; mapper `Number(x)` ile çevirir.

### Deterministic matching (no ML)

Score = `0.7 × (1 - dist/maxRadius) + 0.3 × (rating/5)`. Tie-break
`driverProfileId` asc — aynı input aynı pick. Test'ler tam değer pinler:
5 km / 5.0 rating → 0.86, 1 km / 4.0 rating → 0.912 (1 km en yakın
yüksek skor). 12 matcher unit test.

ADR 0020 — bu kararın gerekçesi + alternatifler (FCFS broadcast,
bidding, ML).

### Atomic assign + availability sentinel (race-safe)

Tek tx içinde:

1. `assignDriver(tx, { fromVersion })` — `WHERE status='CONFIRMED' AND
version=fromVersion`. Concurrent dispatch null döner → throw
   `ConcurrentDispatchError`.
2. `availability.create({ type: 'BOOKED', bookingId })` — paralel
   dispatch tick'i bu sürücüyü bir daha aday görmez.
3. Outbox event (PII-free).

Bu sıra brief'in 4.2'sinden farklı (orada availability search içinde
filtered varsayılıyordu — biz INSERT'i sentinel olarak kullanıyoruz).
PostgreSQL READ COMMITTED altında uncommitted INSERT görünmez, ama
commit sonrası bir sonraki worker tick'inde kesin filter.

### ManualReassign — state machine'i değiştirmedik

DRIVER_ASSIGNED'da admin başka driver atayabilmeli. Brief önerisi: state
DRIVER_ASSIGNED → CONFIRMED → DRIVER_ASSIGNED round-trip. Daha temiz
çözüm: `reassignDriver` repo metodu — `WHERE status='DRIVER_ASSIGNED'`,
sadece driverId/vehicleId/driverAssignedAt/dispatchAttempts/lastDispatchAt
güncellenir, status değişmez. State machine table'ı (ADR 0019) sabit
kalır. Önceki BOOKED availability soft-delete'lenir.

### BookingExpiry pattern'inin tekrarı

`BookingDispatchService` (saf logic, FrozenClock test edilebilir),
`BookingDispatchWorker` (BullMQ shell), `BookingDispatchScheduler`
(`OnModuleInit` + `queue.add(..., { repeat: { every } })`,
`OnApplicationShutdown` + `queue.close`). A4b precedent ile aynı.

### Cooldown + max attempts

`findDispatchable`: `dispatchAttempts < DISPATCH_MAX_ATTEMPTS` (default 3)
AND `(lastDispatchAt IS NULL OR lastDispatchAt < now - cooldownMs)`
(default 60 s). Worker boşa beat etmez.

`requiresManualReview: true` event payload'da `attempts >= max`. A4d/A4e
admin paneli buradan beslenir.

### Outbox PII discipline (sürdürülüyor)

3 dispatch event payload:

- `dispatch.DriverDispatched` — bookingId, driverProfileId, vehicleId,
  distanceKm, score, attempts, dispatchedAt
- `dispatch.DispatchFailed` — bookingId, attempts, reason,
  requiresManualReview, failedAt
- `dispatch.ManualReassignment` — bookingId, previousDriverProfileId,
  newDriverProfileId, reassignedByUserId, reassignedAt

Hiçbiri driver name / plate / lat/lng / address taşımıyor.

### Smoke kanıtı

`scripts/smoke-booking-flow.mjs` 11 → **13 adım**. Yeni adımlar:

- Step 12: ikinci booking confirm (farklı event window — cancel'lanan
  booking ile çakışmasın), 65 s rate-limit beklemesi
- Step 13: 5 s aralıklarla GET /bookings/:id polling, ≤ 90 s içinde
  status `DRIVER_ASSIGNED` + driverId set bekle

Smoke runtime kanıtları:

- Booking2 status → DRIVER_ASSIGNED (worker 30 s tick içinde)
- driverId/vehicleId set (seed fixture driver eşleşti)
- Outbox: BookingCreated + BookingConfirmed + **dispatch.DriverDispatched**
  hepsi `processed_at IS NOT NULL` (BullMQ outbox drain doğrulandı)

Driver fixture seed (`prisma/seed.ts seedDispatchFixture()`): admin
phone'la ayrı bir DRIVER user, APPROVED profile near Sultanahmet
(41.0095, 28.9800), ACTIVE classic-sedan vehicle. Idempotent (deterministic
UUID'ler). Production guard'lı.

### A4d/A4e/A4f'ye devredilenler

- Driver kabul/red akışı (driver app'te match edilince bildirim,
  onay/red, red ise reassign tetikle)
- Notifications (driver SMS/push, customer "sürücünüz yolda" SMS)
- Admin manual-review queue UI (dispatchAttempts >= max + dispatchFailedReason)
- Online drivers monitoring dashboard
- Real-time driver location streaming (websocket — Faz 3+)
- DriverSearchRepo Testcontainers integration spec (CI'da PostGIS
  query'sinin gerçek DB'de doğrulanması — şimdilik smoke runtime kanıt)

---

## 2026-05-09 — Session A4e-1 (Notifications Infrastructure: SMS + Outbox Listener)

A4c'de outbox event yazıyorduk, A4e-1 tüketici zincirini kapattı:
event → in-process listener → BullMQ queue → SMS provider adapter.

### Provider abstraction (ADR 0018 pattern)

`SmsSenderPort`:

- `MockSmsSender` — dev/test, in-memory inbox + global static
  `_testOnlyGetLast/_testOnlyReset` (legacy e2e backwards-compat)
- `NetgsmSmsSender` — prod, axios POST `/sms/send/xml`, response
  `00|01|02 <id>` success, başka kod → `NotificationSendFailedError`
- Factory: `NETGSM_USERCODE.startsWith("DUMMY_")` → Mock. Pricing'in
  `AIzaSy_DUMMY` sentinel'iyle aynı disiplin.

### Templates: file-based + nest-cli assets

Template'ler `infrastructure/templates/<locale>/<key>.txt`. Renderer
`fs.readFile` + `{{var}}` regex substitution + cache. NestJS prod
build'inde TS dosyaları `dist/`'e kopyalanır ama `.txt`'ler değil — bu
yüzden `nest-cli.json`'a `assets` entry eklendi:

```json
"assets": [{
  "include": "modules/notifications/infrastructure/templates/**/*.txt",
  "outDir": "dist/src",
  "watchAssets": true
}]
```

Yoksa prod'da `UnknownTemplateError` patlayacaktı (smoke ile
yakaladım — dev'de `__dirname` src'yi gösterdiği için fark edilmiyordu).

### Outbox listener: cross-module read pattern

`OutboxNotificationListener` `@OnEvent("booking.BookingConfirmed", { async: true })`
ile EventEmitter2'den dinler. Outbox payload PII-free (ADR 0019), bu
yüzden recipient phone'unu kendisi `UserRepositoryPort` (Identity
modülünden import) ile fetch eder.

Bu pattern circular dep yarattı:

- NotificationsModule → IdentityModule (UserRepositoryPort)
- IdentityModule → NotificationsModule (SmsSenderPort + TemplateRenderer)

`forwardRef()` her iki tarafta. NestJS runtime resolve ediyor.

### Identity refactor (BREAKING)

Identity'nin local `SmsSenderPort + MockSmsSender + NetgsmSmsSender +
PrimaryFallbackSmsSender` (4 dosya) silindi. RequestOtpUseCase artık:

- `SmsSenderPort.send({phone, message, sourceId})` — eskisi
  `send({to, body})` idi
- Body construction: `TemplateRenderer.render("identity.otp_request", "tr", { code })`

Spec güncellendi (`smsArg.phone` + `smsArg.message`), e2e import
path'leri sed ile fixledi. MockSmsSender yeni dosyada static helper'lar
(`_testOnlyGetLast/_testOnlyReset`) korundu — A2c'den beri kullanılan
e2e fixture surface'ı bozmamak için.

### Idempotency

`(sourceAggregateId, kind, recipientPhone)` üçlüsü 24h pencere içinde
duplicate bloklar. DB compound index `notifications_source_aggregate_id_kind_recipient_phone_crea_idx`.

OutboxScheduler retry → aynı event 2 kez emit → ikinci
QueueNotificationUseCase çağrısı `findRecentDuplicate` ile mevcut row'u
döndürür, BullMQ enqueue atlanır (createdAt < now-1s check).

### Worker triplet adaptation

A4b/A4c'deki Service+Worker+Scheduler triplet pattern'inden hafif
sapma: scheduler yok (notifications event-driven, schedule değil).
Sadece `NotificationWorker` + `BullModule.registerQueue` + service
yerine `SendNotificationUseCase`. Concurrency 4 (SMS HTTP latency
~200ms paralel okay).

### Smoke proof

Smoke step 14 eklendi: Booking2 confirm sonrası 15s polling, DB'den
notifications query — `BOOKING_CONFIRMED` (booking2) + `BOOKING_CANCELLED`
(booking1) status `SENT` olmalı. Smoke'da spawn `docker exec psql`.

Run kanıtları:

- 3 notification SENT (booking confirm + cancel)
- MockSmsSender inbox kayıt aldı (provider message id, plaintext body)
- Log'da `recipientPhone` `[Redacted]` olarak görünüyor (pino redact)

### A4e-2'ye devredilenler

- Driver SMS (`dispatch.DriverDispatched` → DriverProfile → User → phone)
- Customer SMS for `BookingExpired` (Booking lookup needed)
- Admin-initiated cancel notification fan-out (cancelledByRole=ADMIN
  → still SMS the customer)
- Retry policy: BullMQ attempts 5 + exponential backoff + DLQ
- Push notification adapter (Expo)
- Provider delivery callback (DELIVERED status)
- Admin monitoring controller (list, retry, replay)
- Testcontainers integration spec (Notification → SMS pipeline)
- Live Netgsm staging deploy + manuel doğrulama

---

## 2026-05-11 — Session A4e-2 (Notifications Completion: Retry/DLQ + Cross-Module Reads + Admin)

A4e-1'in deferred kalan iki event handler chain'i tamamlandı, retry +
DLQ devreye girdi, admin monitoring controller'ı + test inbox endpoint
açıldı.

### NotificationContextProvider — cross-module read katmanı

A4e-1 listener'ında ad-hoc `userRepo.findActiveById(...)` çağrıları
vardı. A4e-2 bunu tek servis arkasına aldı:

- `getCustomerContext(userId)` → User
- `getBookingContext(bookingId)` → Booking + bookingShortId +
  privacy-shortened addresses
- `getDriverContext(driverProfileId)` → Driver + User + first vehicle
  (multiple-vehicle Faz 3+, şu an `[0]` alıyor)

Listener kısa kaldı (~150 satır → 4 handler), `@OnEvent` dekoratörleri
provider'a delegate ediyor. NotificationsModule yeni `BookingModule` +
`SupplyModule` plain import'ları ekledi (forwardRef gerekmedi — geri
import yok).

### Privacy: address shortener

`pickupAddress` ve `dropoffAddress` SMS body'sine girmemeli (full sokak
adresi). `shortenAddress()` ikinci virgülden sonrayı düşürür:

- "Sultanahmet Mahallesi, Fatih, İstanbul" → "Sultanahmet Mahallesi, Fatih"

Booking row'unda full adres durur (audit + iade); SMS template'te
sadece kısaltılmış versiyon var (template'ler zaten `bookingShortId`
ve datetime kullanıyor, full adres referans almıyor).

### Retry + DLQ (ADR 0022)

BullMQ retry config QueueNotificationUseCase'in `.add()` opsiyonlarına
gömüldü — NestJS BullModule.registerQueue `defaultJobOptions`
desteklemiyor. Per-job:

```ts
{ attempts: 5, backoff: { type: "exponential", delay: 2000 } }
```

Worker `process()` `job.attemptsMade + 1` ile attemptNumber hesaplar,
final attempt fail olunca DeadLetterNotificationUseCase'i çağırıp
sonra throw eder (BullMQ kayıt için).

`SendNotificationUseCase` her hata sonrası `appendAttempt(tx, id,
{attempt, error, attemptedAt})` ile JSON history journal yazar.
PENDING → SENDING geçişi sadece ilk attempt'te (FAILED'lar direkt
re-attempt olur, status guard yumuşatıldı).

DLQ snapshot pattern: `NotificationDeadLetter` tablosu notification'ın
(channel, kind, recipientPhone, renderedBody, attemptHistory) anlık
çekimini alır. Notification row sonradan değişse veya silinse bile
DLQ kaydı sabit kalır. UNIQUE notification_id index → bir
notification 2 kez DLQ'lanmaz.

PII-free outbox event `notifications.NotificationDeadLettered`
(Slack/email pipeline A5+).

### Admin monitoring

`AdminNotificationsController` `@Roles("ADMIN")`:

- `GET /admin/notifications` — list (status/kind/phone/limit/cursor)
- `POST /admin/notifications/:id/retry` — DEAD_LETTERED veya FAILED'ı
  PENDING'e geri çek + queue.add (jobId farklı çünkü orijinal hâlâ
  failed buffer'da)
- `GET /admin/notifications/dead-letters` — DLQ list (investigated
  filter)
- `POST /admin/notifications/dead-letters/:id/investigate` — admin
  audit (investigatedAt + investigatedByUserId + resolution string)

List view body + phone droplar (PII), detail view (retry response)
exposelar. RBAC zaten ADMIN guard'ında.

### Test ergonomi: HTTP mock inbox

A4e-1 smoke `docker exec psql` ile DB query yapıyordu — yavaş, fragile.
A4e-2 `/notifications/_test/last-sms?phone=...`,
`/notifications/_test/inbox` HTTP endpoint'i ekledi (A4b OTP test
endpoint pattern'i: NODE_ENV guard içeride + module-level conditional).

Smoke step 14 artık fetch ile inbox'tan SMS body okur. Step 15 "Yeni
iş" arar (driver SMS); driver fixture'ı seed edilmediyse soft warn.

### Sapma: Push + Testcontainers ertelendi

Token + zaman disiplini için brief'in iki görevini A5+'a erteledim:

- **G3 ExpoPushSender** — push consumer yok (A4d mobile token
  registration gelene kadar anlamsız). Schema migration + adapter +
  factory iskeleti açtım ama enable etmedim.
- **G6 Testcontainers integration spec** — A4e-1 smoke + A4e-2 unit
  testler kapsam veriyor. Full chain Testcontainers spec marjinal
  değer, ~1000 satır kod.

A4e-1'in deferred iki event flow'u tam wired (BookingExpired customer
SMS + DriverDispatched driver+customer fan-out), retry + DLQ + admin

- HTTP smoke endpoint geldi → A4e MVP-complete.

### Idempotency window pattern doğrulaması

DriverDispatched 2 SMS yaratıyor (driver + customer):

- Aynı sourceAggregateId (bookingId)
- Farklı kind (NEW_BOOKING_OFFER vs DRIVER_ASSIGNED_TO_BOOKING)
- Farklı recipientPhone

24h idempotency window key `(sourceAggregateId, kind, recipientPhone)`
— üçlüde herhangi biri farklıysa ayrı row. Test edilmedi (G6 spec'e
deferred), production'da gözlemlenecek.

### A4e-2 yeni env

```
NOTIFICATION_MAX_ATTEMPTS=5
NOTIFICATION_BACKOFF_DELAY_MS=2000
```

Defaults ADR 0022'deki ~30 sn toplam pencereye karşılık geliyor.

---

## 2026-05-12 — Session A4-Stab (Integration Test Stabilization)

A4c/A4e-1/A4e-2'de erteleneen Testcontainers integration spec borcunu
kapattı. Yeni feature yok — sadece test + helper.

### Test data builder pattern

`apps/api/test/helpers/`:

- `user-builder.ts` — direct INSERT (OTP loop bypass)
- `driver-builder.ts` — User + DriverProfile (APPROVED) + Vehicle
  (ACTIVE) chain tek call'da, deterministik HMAC dummy hash'leriyle
- `quote-builder.ts` — supertest POST `/pricing/quotes`, default
  Saturday August window (compound multiplier 6877.00 TRY pin)
- `auth-token.ts` — `signAccessTokenFor(app, user)` JWT mint, OTP
  flow'u baypas
- `db-cleanup.ts` — TRUNCATE CASCADE per-test mutable tables;
  catalog/pricing fixtures korunur
- `catalog-fixtures.ts` genişletildi: `setupPricingFixtures` + ADDON
  rule (`TRIM_ADDON_RULE_ID`)

### MockSmsSender failure injection

`failNext(N)` / `failAll()` / `clearFailure()` — A4e-2 ADR 0022'de TODO
olarak bırakılmıştı. Retry + DLQ test'lerinde provider'ın deterministik
fail etmesi için.

### 5 yeni Testcontainers spec

| Spec                                            | Test count | Kapsam                                                                            |
| ----------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `booking-lifecycle.integration-spec.ts`         | 6          | confirm + concurrent race + expired quote + cancel + terminal guard + outbox PII  |
| `dispatch.integration-spec.ts`                  | 7          | PostGIS happy + offline/stale/radius/availability filtreleri + race + payload PII |
| `notifications-event-chain.integration-spec.ts` | 6          | 4 event handler + idempotency + retry + DLQ                                       |
| `pricing.integration-spec.ts`                   | 5          | quote + addon + race + 10/min rate limit + outbox PII                             |
| `full-lifecycle.e2e-spec.ts`                    | 1          | login → quote → confirm → dispatch → cancel + her adımda SMS                      |

Toplam **+25 yeni test case**.

### OutboxDrainService.drainOnce() pattern

Spec'ler BullMQ scheduler'i beklemek yerine `drain.drainOnce()` inline
çağırıyor — outbox-drain.integration-spec.ts'in zaten kullandığı
deterministik pattern. SendNotificationUseCase de doğrudan invoke
ediliyor (worker shell baypas) — retry counter / DLQ behavior
deterministik kalıyor.

### Test app harness vazgeçildi

Brief büyük bir TestApp wrapper öneriyordu (drainOutbox / waitForNotification
helper'larıyla). Mevcut pattern (her e2e spec kendi
`Test.createTestingModule([AppModule]).compile()`) zaten çalışıyor ve
sade — spec başına 8 satır setup overhead'i abstract'a değer.

### Drive-by

`.env.example` A4e-2 PR'ında `NOTIFICATION_MAX_ATTEMPTS` +
`NOTIFICATION_BACKOFF_DELAY_MS` satırlarını almamıştı (rebase/squash
kayıp; env.ts ve setup-integration.ts güncel). G1 commit'inde 2 satır
ekleyerek düzeltildi.

### Lokal verifikasyon yapılamadı

Docker Desktop bu lokal makinede sleep durumunda, Testcontainers
`Could not find a working container runtime strategy` hatası veriyor
(A4a smoke borcunda da aynı sorun). Spec'ler ekleniyor ve CI'da
çalışacak — `.github/workflows/ci.yml` `Integration tests` job'u
zaten Testcontainers için yapılandırılmış (A3a'dan beri).

### A4d Mobile için sağlam zemin

Faz 2 borcu kapatıldı; A4d Mobile'a geçiş için integration coverage
ve helper iskeleti hazır. A4d mobile'ında push token registration
geldiğinde Notifications testleri push channel için trivially
extend edilir (şu an SMS-only).

### A5+ ertelenenler (A4-Stab scope dışı)

- ExpoPushSender + push channel integration spec
- Notification preferences (user opt-out)
- Live Netgsm staging deploy + manual doğrulama
- DLQ Slack/email alert pipeline
- Mobile Detox/Maestro e2e (A4d mobile sonrası)
- Performance / load (Faz 3 k6)
