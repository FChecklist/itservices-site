// The Rs 1 payment test of the central website (/paytest/). A REAL Razorpay order of Rs 1 (INR) that buys nothing, so anyone can see that paying and the receipt work.
// - Nothing is sold: the order is filed in the central ledger (B) with product 'payment_test' and is_test = 1, txn_id ITS-<test payment id>.
// - It is left out of revenue, tax, commission and the website-to-central comparison (see migrations/0011_payment_test.sql); the owner report lists it on its own line.
// - The buyer must tick the Terms-and-refund box (K3) first; the server refuses an order without it and records the box with its version and time.
// - ?from= tells which website the test was started from. Only a site code from TEST_FROM is accepted; anything else is filed as ITS.
import { ITS_HOST, TEST_FROM, testFromOf, hex, hmacHex, same, rzpFetch, razorpayReady, txnIdOf } from "./_lib.js";
import { upsertPayment } from "./_central.js";
import { sendTestReceipt } from "./_testmail.js";

export const TEST_AMOUNT_MINOR = 100;
export const CONSENT_VERSION = "K3-2026-10-14";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const MAX_PER_EMAIL_HOUR = 8, MAX_PER_HOUR = 300;

/** Checks the body of an order request. Answers { ok:true, name, email, from } or { error, status }. */
export function parseStart(b) {
  if (!b || typeof b !== "object") return { error: "Please fill in your name and e-mail.", status: 400 };
  if (b.consent !== true) return { error: "Please tick the box to continue.", status: 400 };
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase();
  if (name.length < 2) return { error: "Please enter your name.", status: 400 };
  if (!EMAIL.test(email)) return { error: "Please enter a valid e-mail address.", status: 400 };
  return { ok: true, name, email, from: testFromOf(b.from) };
}

/** Step 1: opens the Rs 1 Razorpay order. */
export async function startPaytest(env, body, now = Date.now()) {
  const v = parseStart(body);
  if (!v.ok) return v;
  if (!env.DB) return { error: "The payment test is not available just now.", status: 503 };
  if (!razorpayReady(env)) return { error: "Payments are not switched on yet.", status: 503 };
  const hour = now - 3600_000;
  const byEmail = (await env.DB.prepare("SELECT COUNT(*) AS n FROM pay_order WHERE is_test=1 AND site=? AND payer_email=? AND created_ms>=?").bind(ITS_HOST, v.email, hour).first())?.n ?? 0;
  const all = (await env.DB.prepare("SELECT COUNT(*) AS n FROM pay_order WHERE is_test=1 AND site=? AND created_ms>=?").bind(ITS_HOST, hour).first())?.n ?? 0;
  if (byEmail >= MAX_PER_EMAIL_HOUR || all >= MAX_PER_HOUR) return { error: "Too many tests just now. Please try again in a little while.", status: 429 };
  const ref = "pt_" + hex(crypto.getRandomValues(new Uint8Array(6))), txn = txnIdOf(ITS_HOST, ref);
  const notes = { site: ITS_HOST, stream: "sales", product: "payment_test", plan: "payment_test", variation: "payment_test", payment_ref: ref, txn_id: txn, is_test: "1", test_from: v.from, consent_v: CONSENT_VERSION, user: v.name };
  let order;
  try { order = await rzpFetch(env, "/orders", { method: "POST", body: JSON.stringify({ amount: TEST_AMOUNT_MINOR, currency: "INR", receipt: ref, notes }) }); }
  catch (e) { return { error: "The payment service said: " + String(e.message ?? e).slice(0, 160), status: 502 }; }
  await env.DB.prepare("INSERT OR IGNORE INTO pay_order(rzp_order_id,site,stream,product,plan,site_payment_ref,payer_user,payer_email,currency,amount_minor,status,created_ms,txn_id,is_test,test_from,consent_ms,consent_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(order.id, ITS_HOST, "sales", "payment_test", "payment_test", ref, v.name, v.email, "INR", TEST_AMOUNT_MINOR, "created", now, txn, 1, v.from, now, CONSENT_VERSION).run();
  return { ok: true, txn_id: txn, payment_ref: ref, keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount_minor: TEST_AMOUNT_MINOR, currency: "INR", from: v.from, prefill: { name: v.name, email: v.email } };
}

/** Step 2: the buyer's browser reports a paid test; we check Razorpay's signature AND ask Razorpay what really happened, file it, and send the receipt once. */
export async function confirmPaytest(env, b, now = Date.now()) {
  if (!b || typeof b !== "object" || !env.DB) return { error: "bad request", status: 400 };
  if (!razorpayReady(env)) return { error: "Payments are not switched on yet.", status: 503 };
  const oid = String(b.razorpay_order_id ?? ""), pid = String(b.razorpay_payment_id ?? ""), sig = String(b.razorpay_signature ?? "");
  if (!/^order_\w+$/.test(oid) || !/^pay_\w+$/.test(pid)) return { error: "bad ids", status: 400 };
  if (!same(await hmacHex(env.RAZORPAY_KEY_SECRET, `${oid}|${pid}`), sig)) return { error: "The payment could not be verified. If money was taken, it will be returned.", status: 400 };
  const order = await env.DB.prepare("SELECT * FROM pay_order WHERE rzp_order_id=? AND site=? AND is_test=1").bind(oid, ITS_HOST).first();
  if (!order) return { error: "We could not match this payment.", status: 404 };
  let p;
  try { p = await rzpFetch(env, `/payments/${pid}`); } catch (e) { return { error: String(e.message ?? e).slice(0, 200), status: 502 }; }
  if (p.order_id !== oid || p.amount !== order.amount_minor || p.currency !== order.currency) return { error: "The payment details did not match the order.", status: 409 };
  if (p.status === "authorized") { try { p = await rzpFetch(env, `/payments/${pid}/capture`, { method: "POST", body: JSON.stringify({ amount: order.amount_minor, currency: order.currency }) }); } catch { /* the status is read again below */ } }
  const paid = p.status === "captured";
  // file it exactly as the webhook would: the order's own notes travel with the payment
  const notes = { ...(p.notes && typeof p.notes === "object" && !Array.isArray(p.notes) ? p.notes : {}), site: ITS_HOST, stream: "sales", product: "payment_test", plan: "payment_test", variation: "payment_test", payment_ref: order.site_payment_ref, txn_id: order.txn_id, is_test: "1", test_from: order.test_from ?? "ITS", user: order.payer_user ?? undefined };
  await upsertPayment(env.DB, now, { event: paid ? "payment.captured" : "payment.verified", payload: { payment: { entity: { ...p, notes, email: p.email ?? order.payer_email } } } }, ITS_HOST, now);
  if (paid) await env.DB.prepare("UPDATE pay_order SET status='paid', paid_ms=COALESCE(paid_ms,?) WHERE rzp_order_id=?").bind(now, oid).run();
  let receipt = "not sent";
  if (paid) receipt = await sendTestReceipt(env, env.DB, pid, now);
  return { ok: true, paid, status: p.status, confirming: !paid && p.status !== "failed", txn_id: order.txn_id, amount_minor: order.amount_minor, currency: order.currency, razorpay_payment_id: pid, razorpay_order_id: oid, method: p.method ?? null, receipt: receipt === "sent" || receipt === "already" ? "emailed" : receipt, from: order.test_from ?? "ITS" };
}

export { TEST_FROM };
