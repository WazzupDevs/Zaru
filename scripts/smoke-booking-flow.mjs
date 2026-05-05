#!/usr/bin/env node
// A4b smoke: end-to-end booking flow (login → quote → confirm → cancel).
//
// Pre-req: API listening on :3000 with NODE_ENV=development, db:up + db:seed
// done. Test customer is +905551112233 (auto-created on first OTP verify).
//
// Run with: node scripts/smoke-booking-flow.mjs
//   API_URL=...      override base URL
//   SMOKE_PHONE=...  override phone (must be TR mobile +90 5XX XXXXXXX)
//
// Single-file, single-runtime — bash + curl + jq + node-eval was unreliable on
// MSYS Windows because `=>` in JS expressions got eaten as shell redirection.

const API = process.env.API_URL ?? "http://localhost:3000";
const PHONE = process.env.SMOKE_PHONE ?? "+905551112233";

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

const step = (n, msg) => console.log(`\n${cyan(`▶ ${n}. ${msg}`)}`);
const ok = (msg) => console.log(`  ${green("✓")} ${msg}`);
const die = (msg) => {
  console.error(`  ${red("✗")} ${msg}`);
  process.exit(1);
};

const ts = () => Date.now().toString();

async function req(method, path, { token, body, idemKey } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idemKey) headers["Idempotency-Key"] = idemKey;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, raw: text };
}

async function main() {
  // 1. Health
  step(1, "Health check");
  const health = await req("GET", "/healthz");
  if (health.status !== 200) die(`healthz ${health.status}`);
  ok("healthz OK");

  // 2. OTP request
  step(2, "Request OTP");
  const otpReq = await req("POST", "/auth/otp/request", {
    body: { phone: PHONE },
    idemKey: `smoke-otp-${ts()}`,
  });
  if (otpReq.status !== 202) die(`OTP request ${otpReq.status}: ${otpReq.raw}`);
  const requestId = otpReq.body?.requestId;
  if (!requestId) die("no requestId returned");
  ok(`OTP requested for ${PHONE} — requestId ${requestId}`);

  // 3. Test-only OTP fetch
  step(3, "Fetch OTP from test-only endpoint");
  await new Promise((r) => setTimeout(r, 500));
  const otpFetch = await req("GET", `/auth/_test/last-otp?phone=${encodeURIComponent(PHONE)}`);
  if (otpFetch.status !== 200) die(`last-otp ${otpFetch.status}: ${otpFetch.raw}`);
  const otp = otpFetch.body?.code;
  if (!/^\d{6}$/.test(otp ?? "")) die(`unexpected OTP shape: ${JSON.stringify(otpFetch.body)}`);
  ok(`OTP retrieved: ${otp}`);

  // 4. Verify (login)
  step(4, "Verify OTP (login)");
  const verify = await req("POST", "/auth/otp/verify", {
    body: { phone: PHONE, requestId, code: otp },
  });
  if (verify.status !== 200) die(`verify ${verify.status}: ${verify.raw}`);
  const token = verify.body?.accessToken;
  const userId = verify.body?.user?.id;
  if (!token) die("no access token");
  ok(`Logged in as user ${userId}`);

  // 5. Catalog ids
  step(5, "Fetch catalog ids");
  const catalog = await req("GET", "/catalog/categories/wedding-car");
  if (catalog.status !== 200) die(`catalog ${catalog.status}: ${catalog.raw}`);
  const categoryId = catalog.body?.id;
  const sedan = catalog.body?.vehicleTypes?.find((v) => v.slug === "classic-sedan");
  if (!categoryId || !sedan?.id) die("could not resolve catalog ids");
  ok(`wedding-car (${categoryId}) / classic-sedan (${sedan.id})`);

  // 6. Quote
  step(6, "Request quote (Sultanahmet → Beşiktaş, 8h, summer Saturday)");
  const quoteReq = await req("POST", "/pricing/quotes", {
    token,
    idemKey: `smoke-quote-${ts()}`,
    body: {
      vehicleTypeId: sedan.id,
      categoryId,
      pickupLat: 41.0082,
      pickupLng: 28.9784,
      dropoffLat: 41.0428,
      dropoffLng: 29.0093,
      pickupAddress: "Sultanahmet, Istanbul",
      dropoffAddress: "Besiktas, Istanbul",
      eventStartAt: "2026-08-15T14:00:00.000Z",
      eventEndAt: "2026-08-15T22:00:00.000Z",
      selectedAddonIds: [],
    },
  });
  if (quoteReq.status !== 201 && quoteReq.status !== 200) {
    die(`quote ${quoteReq.status}: ${quoteReq.raw}`);
  }
  const quoteId = quoteReq.body?.id;
  const total = quoteReq.body?.totalAmount;
  ok(`Quote ${quoteId} — total ${total} TRY`);
  if (total !== "6877.00") die(`expected total 6877.00, got ${total}`);
  ok("compound multiplier (×1.30 yaz × ×1.15 hafta sonu) verified");

  // 7. Confirm booking
  step(7, "Confirm booking");
  const confirm = await req("POST", "/bookings/confirm", {
    token,
    idemKey: `smoke-confirm-${ts()}`,
    body: { quoteId },
  });
  if (confirm.status !== 201 && confirm.status !== 200) {
    die(`confirm ${confirm.status}: ${confirm.raw}`);
  }
  const bookingId = confirm.body?.id;
  const status = confirm.body?.status;
  if (status !== "CONFIRMED") die(`expected CONFIRMED, got ${status}`);
  ok(`Booking ${bookingId} — ${status}`);

  // 8. Double-confirm should 409
  step(8, "Double-confirm must 409");
  const dup = await req("POST", "/bookings/confirm", {
    token,
    idemKey: `smoke-confirm-2-${ts()}`,
    body: { quoteId },
  });
  if (dup.status !== 409) die(`expected 409 on double-confirm, got ${dup.status}: ${dup.raw}`);
  ok("Quote already CONSUMED — second confirm rejected with 409");

  // 9. ListMyBookings
  step(9, "Get my bookings");
  const list = await req("GET", "/bookings/me?limit=5", { token });
  if (list.status !== 200) die(`list ${list.status}`);
  ok(`ListMyBookings returned ${list.body?.length ?? 0} row(s)`);

  // 10. Cancel
  step(10, "Cancel the booking");
  const cancel = await req("POST", `/bookings/${bookingId}/cancel`, {
    token,
    idemKey: `smoke-cancel-${ts()}`,
    body: { reason: "smoke test" },
  });
  if (cancel.status !== 201 && cancel.status !== 200) {
    die(`cancel ${cancel.status}: ${cancel.raw}`);
  }
  if (cancel.body?.status !== "CANCELLED_BY_CUSTOMER") {
    die(`expected CANCELLED_BY_CUSTOMER, got ${cancel.body?.status}`);
  }
  ok(`Cancelled — status ${cancel.body.status}`);

  // 11. Re-cancel
  step(11, "Re-cancel must fail (terminal state)");
  const reCancel = await req("POST", `/bookings/${bookingId}/cancel`, {
    token,
    idemKey: `smoke-cancel-2-${ts()}`,
    body: { reason: "again" },
  });
  if (reCancel.status !== 409) {
    die(`expected 409 on re-cancel, got ${reCancel.status}: ${reCancel.raw}`);
  }
  ok("Terminal-state guard fired (409)");

  console.log(`\n${green("✓ A4b smoke flow completed")}`);
  console.log(`   booking: ${bookingId}`);
  console.log(`   quote:   ${quoteId}`);
  console.log(`   user:    ${userId}`);
}

main().catch((err) => {
  console.error(red("FATAL: ") + (err?.stack ?? String(err)));
  process.exit(1);
});
