# Driver Mobile App (A4f-1a scaffold)

Expo SDK 52 + RN 0.76 + Expo Router + NativeWind v4. Closed-beta
driver app — admin invites a phone via `/admin/driver-invites`, the
driver's auth flow gates on the whitelist.

## Mevcut kapsam (A4f-1a)

- Expo iskelet (monorepo metro wiring, brand placeholder)
- Auth flow: phone → OTP verify → role=DRIVER promotion (server-side)
- Storage: tokens + user, namespaced session key, role guard on read
- Role-mismatch guard: `WrongAppRoleError` when `/auth/me` veya
  `/auth/driver/otp/verify` DRIVER olmayan rol döndürürse
- Whitelist gating UI: `DRIVER_NOT_INVITED` → "Operasyon ekibinizle
  iletişime geçin"
- Customer mobile aynı pattern ile DRIVER reddediyor (symmetric guard)

## A4f-1b (sıradaki oturum)

- Online/offline toggle (`/dispatch/drivers/:id/online-status`)
- Foreground location update (`expo-location` + `/dispatch/drivers/:id/location`)
- Driver push token registration (A4e-3 PushTokenService reuse)
- NotificationContextProvider getDriverPushContext + listener routing
- Profile screen + tab navigator
- Bootstrap + storage unit tests

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
│       ├── _layout.tsx       App stack (A4f-1b extends to tabs)
│       └── index.tsx         Placeholder home (A4f-1b: online toggle)
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
