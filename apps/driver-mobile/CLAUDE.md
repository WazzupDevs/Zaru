# Driver Mobile App (A4f-1b)

Expo SDK 52 + RN 0.76 + Expo Router + NativeWind v4. Closed-beta
driver app — admin invites a phone via `/admin/driver-invites`, the
driver's auth flow gates on the whitelist.

## Mevcut kapsam

**A4f-1a** (auth scaffolding):

- Expo iskelet (monorepo metro wiring, brand placeholder)
- Auth flow: phone → OTP verify → role=DRIVER promotion (server-side)
- Storage: tokens + user, namespaced session key, role guard on read
- Role-mismatch guard: `WrongAppRoleError` when `/auth/me` veya
  `/auth/driver/otp/verify` DRIVER olmayan rol döndürürse
- Whitelist gating UI: `DRIVER_NOT_INVITED` → "Operasyon ekibinizle
  iletişime geçin"
- Customer mobile aynı pattern ile DRIVER reddediyor (symmetric guard)

**A4f-1b** (online + location + push + profile):

- Online/offline toggle (`/dispatch/drivers/:id/online-status`) —
  foreground location permission flow + initial position update before
  the online flag flips
- Hybrid permission rationale modal — app-level "Konum İzni Gerekiyor"
  sheet shown BEFORE the OS prompt (iOS one-shot defense)
- Driver push token registration (`expo-notifications`) on OTP verify;
  Android channel id "dispatch" w/ default sound, customer-mobile uses
  "bookings"
- Profile screen + tab navigator (Anasayfa + Profil); emoji icons,
  lucide deferred to A4f-3
- Sign-out cleanup: best-effort `setOnlineStatus(false)` +
  `updatePushToken(null)` so a logged-out driver doesn't keep getting
  dispatch offers
- `AuthUserSummary.driverProfileId` nullable — mid-onboarding stub on
  home screen when set
- Bootstrap + storage shape-guard vitest suite (21 tests)

## A4f-1b mutlaka uyulacak yeni kurallar

### Online flow order (location BEFORE online flag)

`activateOnline` MUST `getCurrentPosition → updateLocation →
setOnlineStatus(true)` in that order. The dispatch matcher filters
drivers by `location_updated_at > now() - 5min`; flipping online with
a stale location row silently excludes the driver from matching. See
[docs/development-notes.md](../../docs/development-notes.md) A4f-1b
for the longer rationale.

The reverse online → offline path is just `setOnlineStatus(false)`.
We deliberately do NOT clear the location row server-side: a driver
who flips back online inside the freshness window skips the
permission dance.

### Permission rationale modal BEFORE the OS prompt

`Location.requestForegroundPermissionsAsync()` on iOS shows the
system dialog exactly once per install. The
`LocationPermissionModal` is the gate — three reassurance bullets
(only-when-online / off-when-closed / used-only-for-matching) prime
the user before the OS prompt fires. Skipping the modal on first tap
trades a 3-second explanation for a permanent denial.

`existing.status === Location.PermissionStatus.GRANTED` (enum
member, not raw `"granted"` string) — same convention everywhere we
compare permission statuses.

### `driverProfileId === null` is a real state

Driver invited + OTP-verified, but supply hasn't created a
DriverProfile row yet. Three places handle null:

1. `DriverAuthUserSchema.driverProfileId: z.string().nullable()` —
   verify + getMe parses accept null without throwing.
2. Storage shape guard — does NOT validate this field; round-trips
   automatically (covered by `secure-token-storage.test.ts`).
3. Home screen — early-return with an "Operasyon ekibi haber
   verecek" stub. NOT a 404 against `/dispatch/drivers/null/...`.

Inside callbacks that fire AFTER the early-return, capture the
non-null reference once: `const profileId: string = driverProfileId;`
— do NOT use `as string`, ESLint blocks it.

### Push token registration mirrors customer-mobile

`PushTokenService` is a 1:1 copy with two config knobs:
ANDROID_CHANNEL_ID = "dispatch" (vs customer's "bookings"), sound:
"default". Both apps call `usersApi.updatePushToken(token)` with the
same `/users/me/push-token` endpoint; backend distinguishes by the
authenticated User's role.

Sign-out clears the token (`updatePushToken(null)`). Failure on
this call is logged + swallowed — the local session is already gone
client-side, so a next-cold-start with stale server-side token is
the worst case (one wasted push).

### Idempotency-Key 5-second bucket on online toggle

`driver-online-${driverProfileId}-${isOnline}-${5s-bucket}`. Bucket
keeps double-tap deduped on the server (one online flip, one audit
row), but a deliberate retry 6+ seconds later goes through with a
fresh key. Don't widen the bucket without thinking through the
"driver tries to go online → fails → tries again" UX.

## A4f-2 (driver dispatch UX)

- Pending offer screen (push delivers + tap → accept/reject)
- Active job screen (booking detail, navigate, complete)
- Job list + history
- Driver-side cancel flow

## A4f-3 (polish)

- Background location updates (`expo-task-manager` + `expo-location`)
- Lucide icons + brand SVG set
- Jest + jest-expo + RTL component test suite
- Native datetime picker (if needed for shift scheduling)

## A4g (production)

- Real EAS Build + projectId
- Real Expo gateway via ExpoPushSender
- Real brand identity + splash + app icon

## Mimari

```
apps/driver-mobile/
├── app/                      Expo Router (file-based)
│   ├── _layout.tsx           Root: GestureHandler + SafeArea + AuthProvider + Stack
│   ├── index.tsx             Cold-start splash → redirect (auth) or (app)
│   ├── (auth)/
│   │   ├── _layout.tsx       Auth stack
│   │   ├── phone.tsx         Telefon entry + DRIVER_NOT_INVITED translation
│   │   └── verify.tsx        OTP entry + WrongAppRoleError translation
│   └── (app)/
│       ├── _layout.tsx       Tabs (Anasayfa + Profil), emoji icons
│       ├── index.tsx         Online toggle home + permission modal
│       └── profile.tsx       Driver info display + sign out
├── src/
│   ├── components/           UI primitives (1:1 copy from customer-mobile)
│   ├── contexts/auth-context.tsx
│   ├── hooks/use-auth.ts
│   ├── lib/
│   │   ├── api/              client + driver-auth + errors + barrel
│   │   ├── auth/bootstrap.ts (cached + background validate)
│   │   ├── format/phone.ts   (1:1 from customer-mobile)
│   │   ├── logger.ts         (1:1 from customer-mobile)
│   │   └── storage/          driver-namespaced session key
│   └── test/                 vitest setup + module mocks
├── tailwind.config.js        Brand: black + safety-green + online/offline
├── metro.config.js           Monorepo watchFolders + nodeModulesPaths
└── app.config.ts             Bundle id: com.eventfleet.driver
```

## Mutlaka uyulacak kurallar

### Role-mismatch guard

Both verifyOtp + getMe parse the user through Zod with
`role: z.literal("DRIVER")`. Mismatch throws `WrongAppRoleError` (a
typed error, not a raw ZodError) so screens map to friendly TR copy.

Storage `isStoredAuthSession` shape guard ALSO checks
`user.role === "DRIVER"` on read — defends against a stale dev build
having leaked a customer session into driver storage.

### Whitelist UI translation

Backend errors come through with stable codes (`DRIVER_NOT_INVITED`,
`INVALID_PHONE`, `RATE_LIMITED`). The phone screen maps them to TR
copy directing the user to the operations team. Default fallback:
show `err.message` (server already returns localized strings for the
common paths).

### Storage namespace

`SESSION_KEY = "event_fleet_driver_auth_session_v1"` — different from
customer-mobile's `event_fleet_auth_session_v2`. A device with both
apps installed must NEVER mix sessions in the OS Keychain.

### Pattern reuse vs extraction

Components / format helpers / logger / API client + errors are 1:1
copies from customer-mobile. The intent is to extract them to
`packages/mobile-shared` once a third app shows up — extraction now
would be premature (early abstraction). Until then: edits to a shared
file should land in BOTH apps simultaneously to avoid drift.

Config knobs that intentionally differ between the apps:
brand colors, bundle id, splash background, SESSION_KEY prefix,
auth API endpoint paths (/auth/otp vs /auth/driver/otp), Zod role
literal in the user schema.

### React 18/19 type collision

Same workaround as customer-mobile (see `apps/customer-mobile/CLAUDE.md`):
pnpm.overrides scoped to `@event-fleet/driver-mobile` pinning
`@types/react@~18.3.12` + `@types/react-dom@~18.3.0`
tsconfig paths redirecting `react` + `react/*` to mobile-local
