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

  // ============================================================
  // A4c dispatch — second booking flows through the worker
  // ============================================================

  step(12, "Confirm a SECOND booking for dispatch verification");
  // Wait for the per-user pricing rate-limit window before requesting
  // another quote. This isolates A4c's dispatch flow from A4b's cancel test.
  console.log("  (waiting 65 s for pricing rate-limit reset)");
  await new Promise((r) => setTimeout(r, 65_000));

  const quote2 = await req("POST", "/pricing/quotes", {
    token,
    idemKey: `smoke-quote-2-${ts()}`,
    body: {
      vehicleTypeId: sedan.id,
      categoryId,
      pickupLat: 41.0082,
      pickupLng: 28.9784,
      dropoffLat: 41.0428,
      dropoffLng: 29.0093,
      pickupAddress: "Sultanahmet, Istanbul",
      dropoffAddress: "Besiktas, Istanbul",
      // Different event window so the dispatch worker doesn't see the
      // cancelled booking's window (cancellation already releases it
      // but distinct windows make the test crisp).
      eventStartAt: "2026-09-12T14:00:00.000Z",
      eventEndAt: "2026-09-12T22:00:00.000Z",
      selectedAddonIds: [],
    },
  });
  if (quote2.status !== 201 && quote2.status !== 200) {
    die(`quote2 ${quote2.status}: ${quote2.raw}`);
  }
  const quoteId2 = quote2.body?.id;
  ok(`Quote2 ${quoteId2}`);

  const confirm2 = await req("POST", "/bookings/confirm", {
    token,
    idemKey: `smoke-confirm-3-${ts()}`,
    body: { quoteId: quoteId2 },
  });
  if (confirm2.status !== 201 && confirm2.status !== 200) {
    die(`confirm2 ${confirm2.status}: ${confirm2.raw}`);
  }
  const bookingId2 = confirm2.body?.id;
  ok(`Booking2 ${bookingId2} CONFIRMED — handoff to dispatch worker`);

  step(13, "Wait for dispatch worker (≤ 90 s)");
  let dispatched = null;
  for (let attempt = 1; attempt <= 18; attempt++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const get = await req("GET", `/bookings/${bookingId2}`, { token });
    if (get.status !== 200) die(`get booking2 ${get.status}`);
    if (get.body?.status === "DRIVER_ASSIGNED" && get.body?.driverId) {
      dispatched = get.body;
      ok(
        `Dispatch worker fired — status DRIVER_ASSIGNED, driver ${get.body.driverId}, vehicle ${get.body.vehicleId}`,
      );
      break;
    }
    if (attempt % 3 === 0) {
      console.log(`  …still ${get.body?.status} after ${attempt * 5} s`);
    }
  }
  if (!dispatched) {
    die("dispatch worker did not assign within 90 s — check API logs / DB driver fixture");
  }

  // ============================================================
  // A4e-1 notifications — outbox listener + worker delivered SMS
  // ============================================================

  step(14, "Wait for outbox notification listener (≤ 15 s)");
  // BookingConfirmed for booking2 + BookingCancelled for booking1.
  // Outbox drain runs ~2 s, then queue → worker → MockSmsSender.
  const { spawnSync } = await import("node:child_process");
  let confirmedRow = null;
  let cancelledRow = null;
  for (let i = 1; i <= 15; i++) {
    await new Promise((r) => setTimeout(r, 1_000));
    const out = spawnSync(
      "docker",
      [
        "exec",
        "event-fleet-postgres",
        "psql",
        "-U",
        "eventfleet",
        "-d",
        "eventfleet",
        "-tA",
        "-c",
        `SELECT id || '|' || kind || '|' || status || '|' || COALESCE(source_aggregate_id::text, '') FROM notifications WHERE source_aggregate_id IN ('${bookingId}','${bookingId2}') ORDER BY created_at DESC;`,
      ],
      { encoding: "utf-8" },
    );
    const lines = out.stdout.split("\n").filter(Boolean);
    confirmedRow = lines.find((l) => l.includes(`BOOKING_CONFIRMED|SENT|${bookingId2}`));
    cancelledRow = lines.find((l) => l.includes(`BOOKING_CANCELLED|SENT|${bookingId}`));
    if (confirmedRow && cancelledRow) break;
  }
  if (!confirmedRow) die(`BOOKING_CONFIRMED notification for ${bookingId2} not SENT within 15 s`);
  if (!cancelledRow) die(`BOOKING_CANCELLED notification for ${bookingId} not SENT within 15 s`);
  ok(`BOOKING_CONFIRMED → SENT (${confirmedRow.split("|")[0]})`);
  ok(`BOOKING_CANCELLED → SENT (${cancelledRow.split("|")[0]})`);

  console.log(`\n${green("✓ A4e-1 smoke flow completed")}`);
  console.log(`   booking1 (cancel flow):   ${bookingId}`);
  console.log(`   booking2 (dispatch flow): ${bookingId2}`);
  console.log(`   driver assigned:          ${dispatched.driverId}`);
  console.log(`   vehicle assigned:         ${dispatched.vehicleId}`);
  console.log(`   user:                     ${userId}`);
}

main().catch((err) => {
  console.error(red("FATAL: ") + (err?.stack ?? String(err)));
  process.exit(1);
});
