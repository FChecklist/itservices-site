// Tests of the Rs 1 payment test of the central website (functions/_paytest.js, _testmail.js, the routes, the webhook, reconcile, commission and the owner report),
// run against the REAL migrations in an in-memory SQLite. Razorpay and Resend are replaced by a stand-in. Run: bun test
import { describe, expect, test, beforeEach } from "bun:test";
import { createHmac } from "node:crypto";
import { makeD1 } from "./d1-sqlite.js";
import { ITS_HOST, testFromOf, TEST_FROM } from "../functions/_lib.js";
import { parseStart, startPaytest, confirmPaytest, CONSENT_VERSION } from "../functions/_paytest.js";
import { onRequestPost as orderRoute } from "../functions/api/pay/paytest.js";
import { onRequestPost as verifyRoute } from "../functions/api/pay/paytest-verify.js";
import { onRequestPost as commissionRoute } from "../functions/api/pay/commission.js";
import { onRequestPost as reconcileRoute } from "../functions/api/pay/reconcile.js";
import { onRequestPost as verifySiteRoute } from "../functions/api/pay/verify.js";
import { onRequestGet as ledgerRoute } from "../functions/api/pay/ledger.js";
import { handleRazorpayWebhook } from "../functions/_central.js";
import { sendTestReceipt } from "../functions/_testmail.js";
import { buildReport } from "../functions/_report.js";

const SECRET = "test_secret_value", WH = "whsec_test";
const sign = (o, p) => createHmac("sha256", SECRET).update(`${o}|${p}`).digest("hex");
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const good = { name: "Asha Rao", email: "Asha@Example.com", consent: true, from: "COA" };

let d, env, orders, rzp, mails, failMail, seq, realFetch = globalThis.fetch;
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (x) => x.toString(16).padStart(2, "0")).join("");

beforeEach(() => {
  d = makeD1(); orders = []; rzp = new Map(); mails = []; failMail = false; seq = 0;
  env = { DB: d.db, RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: WH, RESEND_API_KEY: "re_test", RECONCILE_KEY: "rk", LEDGER_KEY: "lk" };
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes("api.resend.com")) { if (failMail) return json({ error: "no" }, 500); mails.push(JSON.parse(init.body)); return json({ id: "m" + mails.length }); }
    if (url.endsWith("/v1/orders") && init.method === "POST") { const b = JSON.parse(init.body); const o = { id: "order_T" + ++seq, ...b }; orders.push(o); return json(o); }
    let m = url.match(/\/payments\/(pay_\w+)\/capture$/);
    if (m && init.method === "POST") { const p = rzp.get(m[1]); p.status = "captured"; return json(p); }
    m = url.match(/\/payments\/(pay_\w+)$/);
    if (m) return rzp.has(m[1]) ? json(rzp.get(m[1])) : json({ error: { description: "not found" } }, 404);
    if (url.includes("/payments?")) return json({ items: [...rzp.values()] });
    if (url.includes("/refunds?")) return json({ items: [] });
    return json({ error: { description: "unexpected " + url } }, 500);
  };
});

/** A Razorpay payment for an order (what Razorpay's API answers). */
const payFor = (order, over = {}) => ({ id: "pay_" + "A".repeat(6) + ++seq, order_id: order.id, amount: order.amount, currency: "INR", status: "captured", method: "upi", email: "asha@example.com", contact: "+919999999999", fee: 236, tax: 36, notes: order.notes, created_at: Math.floor(Date.now() / 1000), vpa: "asha@upi", ...over });
/** Starts a test and has "Razorpay" capture it; returns { order, pay, start }. */
async function paidTest(over = {}, body = good) {
  const start = await startPaytest(env, body);
  expect(start.ok).toBe(true);
  const order = orders.at(-1), pay = payFor(order, over);
  rzp.set(pay.id, pay);
  return { start, order, pay };
}
const row = (sql, ...a) => d.raw.query(sql).get(...a);
const rows = (sql, ...a) => d.raw.query(sql).all(...a);

describe("who may start a test", () => {
  test("the Terms box must be ticked, the name and e-mail must be real", () => {
    expect(parseStart({ ...good, consent: false }).error).toMatch(/tick the box/);
    expect(parseStart({ ...good, consent: "true" }).error).toMatch(/tick the box/); // only a real true counts
    expect(parseStart({ ...good, name: "A" }).error).toMatch(/name/);
    expect(parseStart({ ...good, email: "nope" }).error).toMatch(/e-mail/);
    expect(parseStart(null).status).toBe(400);
    const ok = parseStart(good);
    expect(ok).toMatchObject({ ok: true, name: "Asha Rao", email: "asha@example.com", from: "COA" });
  });
  test("?from= takes only a site code from the list; anything else is filed as ITS", () => {
    expect(TEST_FROM).toEqual(["COA", "IDX", "DPD", "ITS"]);
    for (const f of ["COA", "idx", " dpd ", "ITS"]) expect(testFromOf(f)).toBe(f.trim().toUpperCase());
    for (const f of ["TAM", "<script>alert(1)</script>", "COA,IDX", "", undefined, null, "x".repeat(300)]) expect(testFromOf(f)).toBe("ITS");
  });
  test("control characters and angle brackets never reach the name", () => {
    expect(parseStart({ ...good, name: "Asha\r\nBcc: x@y.z <b>" }).name).toBe("Asha Bcc: x@y.z b");
  });
});

describe("step 1: the order", () => {
  test("opens a real Rs 1 order, tagged for the central ledger, and records the consent", async () => {
    const r = await startPaytest(env, good);
    expect(r).toMatchObject({ ok: true, amount_minor: 100, currency: "INR", from: "COA", orderId: "order_T1", keyId: "rzp_test_abc" });
    expect(r.txn_id).toMatch(/^ITS-pt_[0-9a-f]{12}$/);
    const o = orders[0];
    expect(o).toMatchObject({ amount: 100, currency: "INR" });
    expect(o.notes).toMatchObject({ site: ITS_HOST, stream: "sales", product: "payment_test", plan: "payment_test", variation: "payment_test", is_test: "1", test_from: "COA", txn_id: r.txn_id, payment_ref: r.payment_ref, consent_v: CONSENT_VERSION });
    expect(Object.keys(o.notes).length).toBeLessThanOrEqual(15);
    const po = row("SELECT * FROM pay_order WHERE rzp_order_id='order_T1'");
    expect(po).toMatchObject({ site: ITS_HOST, plan: "payment_test", is_test: 1, test_from: "COA", amount_minor: 100, currency: "INR", payer_email: "asha@example.com", payer_user: "Asha Rao", txn_id: r.txn_id, consent_version: CONSENT_VERSION });
    expect(po.consent_ms).toBeGreaterThan(0);
  });
  test("without the box ticked nothing is sent to Razorpay and nothing is stored", async () => {
    const res = await orderRoute({ request: new Request("https://x/api/pay/paytest", { method: "POST", body: JSON.stringify({ ...good, consent: false }) }), env });
    expect(res.status).toBe(400);
    expect(orders.length).toBe(0);
    expect(row("SELECT COUNT(*) AS n FROM pay_order").n).toBe(0);
  });
  test("an unknown ?from= is stored as ITS, the route answers JSON with the key id", async () => {
    const res = await orderRoute({ request: new Request("https://x/api/pay/paytest", { method: "POST", body: JSON.stringify({ ...good, from: "<img onerror=1>" }) }), env });
    const b = await res.json();
    expect(res.status).toBe(200);
    expect(b.from).toBe("ITS");
    expect(orders[0].notes.test_from).toBe("ITS");
  });
  test("a single e-mail address cannot open more than 8 orders an hour", async () => {
    for (let i = 0; i < 8; i++) expect((await startPaytest(env, good)).ok).toBe(true);
    const r = await startPaytest(env, good);
    expect(r.status).toBe(429);
    expect((await startPaytest(env, { ...good, email: "other@example.com" })).ok).toBe(true);
  });
  test("payments not configured -> 503, Razorpay refuses -> 502 and no order row", async () => {
    expect((await startPaytest({ ...env, RAZORPAY_KEY_ID: "" }, good)).status).toBe(503);
    const keep = globalThis.fetch; globalThis.fetch = async () => json({ error: { description: "bad key" } }, 401);
    const r = await startPaytest(env, good); globalThis.fetch = keep;
    expect(r.status).toBe(502);
    expect(row("SELECT COUNT(*) AS n FROM pay_order").n).toBe(0);
  });
});

describe("step 2: the confirmation, the ledger row and the receipt", () => {
  test("a good signature and a captured payment file a test row and send one receipt", async () => {
    const { start, order, pay } = await paidTest();
    const res = await verifyRoute({ request: new Request("https://x/api/pay/paytest-verify", { method: "POST", body: JSON.stringify({ razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) }) }), env });
    const b = await res.json();
    expect(res.status).toBe(200);
    expect(b).toMatchObject({ ok: true, paid: true, status: "captured", txn_id: start.txn_id, amount_minor: 100, currency: "INR", receipt: "emailed", from: "COA" });
    const p = row("SELECT * FROM payment WHERE rzp_payment_id=?", pay.id);
    expect(p).toMatchObject({ site: ITS_HOST, product: "payment_test", product_type: "payment_test", plan: "payment_test", stream: "sales", status: "paid", is_test: 1, test_from: "COA", txn_id: start.txn_id, site_payment_ref: start.payment_ref, amount_minor: 100, currency: "INR", payer_email: "asha@example.com", fee_minor: 236, tax_minor: 36 });
    expect(p.receipt_ms).toBeGreaterThan(0);
    expect(row("SELECT status FROM pay_order WHERE rzp_order_id=?", order.id).status).toBe("paid");
    expect(mails.length).toBe(1);
    expect(mails[0].to).toEqual(["asha@example.com"]);
    expect(mails[0].subject).toContain(start.txn_id);
    expect(mails[0].text).toContain("Rs 1");
    expect(mails[0].text).not.toMatch(/owner|legal|review pending/i);
  });
  test("a wrong signature is refused and files nothing", async () => {
    const { order, pay } = await paidTest();
    const r = await confirmPaytest(env, { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: "0".repeat(64) });
    expect(r.status).toBe(400);
    expect(row("SELECT COUNT(*) AS n FROM payment").n).toBe(0);
    expect(mails.length).toBe(0);
  });
  test("a payment for a different amount or order is refused", async () => {
    const { order, pay } = await paidTest({ amount: 5000 });
    const r = await confirmPaytest(env, { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) });
    expect(r.status).toBe(409);
    expect(row("SELECT COUNT(*) AS n FROM payment").n).toBe(0);
  });
  test("an order that is not a payment test of this website is not found", async () => {
    d.raw.query("INSERT INTO pay_order(rzp_order_id,site,stream,plan,currency,amount_minor,status,created_ms,is_test) VALUES('order_X','corporate-bingo.pages.dev','sales','bingo_pack_100','INR',100,'created',1,0)").run();
    const r = await confirmPaytest(env, { razorpay_order_id: "order_X", razorpay_payment_id: "pay_Z1", razorpay_signature: sign("order_X", "pay_Z1") });
    expect(r.status).toBe(404);
  });
  test("an authorized payment is captured, then filed as paid", async () => {
    const { order, pay } = await paidTest({ status: "authorized" });
    const r = await confirmPaytest(env, { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) });
    expect(r.paid).toBe(true);
    expect(row("SELECT status FROM payment WHERE rzp_payment_id=?", pay.id).status).toBe("paid");
  });
  test("a failed payment is filed as failed, no receipt, never paid", async () => {
    const { order, pay } = await paidTest({ status: "failed", error_code: "BAD_REQUEST_ERROR", error_reason: "payment_failed" });
    const r = await confirmPaytest(env, { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) });
    expect(r).toMatchObject({ ok: true, paid: false, status: "failed", confirming: false });
    expect(row("SELECT status, is_test FROM payment WHERE rzp_payment_id=?", pay.id)).toMatchObject({ status: "failed", is_test: 1 });
    expect(mails.length).toBe(0);
  });
  test("ONE receipt per payment, however many times the three paths run", async () => {
    const { order, pay } = await paidTest();
    const body = { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) };
    await confirmPaytest(env, body);
    await confirmPaytest(env, body); // the buyer pressed again
    // Razorpay's webhook for the same payment
    const ev = JSON.stringify({ id: "evt1", event: "payment.captured", created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: pay } } });
    const hook = (id) => handleRazorpayWebhook(new Request("https://x/api/pay/webhook", { method: "POST", headers: { "x-razorpay-signature": createHmac("sha256", WH).update(ev).digest("hex"), "x-razorpay-event-id": id }, body: ev }), env, ITS_HOST);
    expect((await hook("evt1")).status).toBe(200);
    expect((await hook("evt2")).status).toBe(200);
    // the 30-minute comparison with Razorpay
    const rec = await reconcileRoute({ request: new Request("https://x/api/pay/reconcile?days=1", { method: "POST", headers: { "x-reconcile-key": "rk" } }), env });
    expect((await rec.json()).ok).toBe(true);
    expect(mails.length).toBe(1);
    expect(row("SELECT COUNT(*) AS n FROM payment").n).toBe(1);
  });
  test("a receipt that could not be sent gives the claim back, so the next path sends it", async () => {
    const { order, pay } = await paidTest();
    const body = { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) };
    failMail = true;
    const r = await confirmPaytest(env, body);
    expect(r.paid).toBe(true);
    expect(r.receipt).toBe("failed");
    expect(row("SELECT receipt_ms FROM payment WHERE rzp_payment_id=?", pay.id).receipt_ms).toBeNull();
    failMail = false;
    // the buyer closed the page: the 30-minute comparison with Razorpay finishes the job
    const rec = await (await reconcileRoute({ request: new Request("https://x/api/pay/reconcile?days=1", { method: "POST", headers: { "x-reconcile-key": "rk" } }), env })).json();
    expect(rec.test_receipts).toBe(1);
    expect(mails.length).toBe(1);
  });
  test("the webhook alone (buyer closed the page) files the test, flags it and sends the receipt", async () => {
    const { order, pay } = await paidTest();
    const ev = JSON.stringify({ id: "evt9", event: "payment.captured", created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: pay } } });
    const res = await handleRazorpayWebhook(new Request("https://x/api/pay/webhook", { method: "POST", headers: { "x-razorpay-signature": createHmac("sha256", WH).update(ev).digest("hex"), "x-razorpay-event-id": "evt9" }, body: ev }), env, "corporate-tambola.pages.dev");
    expect(res.status).toBe(200);
    expect(row("SELECT site, is_test, test_from, product_type, status FROM payment WHERE rzp_payment_id=?", pay.id)).toMatchObject({ site: ITS_HOST, is_test: 1, test_from: "COA", product_type: "payment_test", status: "paid" });
    expect(mails.length).toBe(1);
    void order;
  });
  test("tests of the games are not mailed from here", async () => {
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,payer_email,amount_minor,updated_ms,captured_ms,txn_id) VALUES('pay_G1','corporate-bingo.pages.dev','paid','payment_test','payment_test',1,'g@example.com',100,1,1,'BNG-pay_1')").run();
    expect(await sendTestReceipt(env, d.db, "pay_G1")).toBe("skipped");
    expect(mails.length).toBe(0);
  });
  test("no mail key -> no claim is taken, so a later send still works", async () => {
    const { order, pay } = await paidTest();
    const noKey = { ...env, RESEND_API_KEY: undefined };
    const r = await confirmPaytest(noKey, { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) });
    expect(r.receipt).toBe("no mail key");
    expect(row("SELECT receipt_ms FROM payment WHERE rzp_payment_id=?", pay.id).receipt_ms).toBeNull();
    expect(await sendTestReceipt(env, d.db, pay.id)).toBe("sent");
  });
});

describe("a payment test is not a sale", () => {
  const sale = (id, ref, site = "corporate-bingo.pages.dev") => d.raw.query("INSERT INTO payment(rzp_payment_id,site,stream,plan,product,product_type,site_payment_ref,status,currency,amount_minor,created_ms,captured_ms,updated_ms,fee_minor,tax_minor,txn_id,is_test) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
    .run(id, site, "sales", "bingo_pack_100", "corporate_bingo", "game_pack", ref, "paid", "INR", 239900, Date.now(), Date.now(), Date.now(), 5660, 863, "BNG-" + ref);
  async function settle() { const { order, pay } = await paidTest(); await confirmPaytest(env, { razorpay_order_id: order.id, razorpay_payment_id: pay.id, razorpay_signature: sign(order.id, pay.id) }); return pay; }

  test("it is left out of revenue, the master ledger, the tax summary and the profit and loss", async () => {
    sale("pay_S1", "pay_1");
    const t = await settle();
    expect(rows("SELECT own_id FROM pnl_lines WHERE line_type='sale'").map((r) => r.own_id)).toEqual(["pay_S1"]);
    expect(rows("SELECT razorpay_ref FROM master_ledger WHERE direction='in'").map((r) => r.razorpay_ref)).toEqual(["pay_S1"]);
    expect(row("SELECT SUM(total) AS t FROM tax_summary WHERE direction='in'").t).toBeCloseTo(2399, 2);
    expect(rows("SELECT * FROM pnl_lines WHERE rzp_payment_id=?", t.id).length).toBe(0);
    expect(row("SELECT revenue FROM pnl_summary").revenue).toBeCloseTo(2399, 2);
  });
  test("it never raises a ledger problem, whatever it is missing", async () => {
    sale("pay_S1", "pay_1");
    d.raw.query("UPDATE payment SET fee_minor=1, tax_minor=1, captured_ms=captured_ms").run();
    // a paid test with no fee figures, no site payment ref, no txn id and a captured time long ago
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,amount_minor,updated_ms,captured_ms) VALUES('pay_T1',?,'paid','payment_test','payment_test',1,100,1,1000)").run(ITS_HOST);
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,amount_minor,updated_ms,failed_ms,site_payment_ref) VALUES('pay_T2',?,'failed','payment_test','payment_test',1,100,1,1000,'pt_dup')").run(ITS_HOST);
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,amount_minor,updated_ms,captured_ms,site_payment_ref) VALUES('pay_T3',?,'paid','payment_test','payment_test',1,100,1,1000,'pt_dup')").run(ITS_HOST);
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,amount_minor,updated_ms,captured_ms,site_payment_ref) VALUES('pay_T4',?,'paid','payment_test','payment_test',1,100,1,1000,'pt_dup')").run(ITS_HOST);
    expect(rows("SELECT * FROM ledger_issues")).toEqual([]);
    // the same gaps on a REAL sale are still caught
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,amount_minor,updated_ms,captured_ms) VALUES('pay_R1','corporate-bingo.pages.dev','paid','game_pack','bingo_pack_100',0,100,1,1000)").run();
    const kinds = rows("SELECT issue FROM ledger_issues").map((r) => r.issue).sort();
    expect(kinds).toEqual(["paid_without_fee_figures", "paid_without_site_payment_ref", "paid_without_txn_id"]);
  });
  test("it earns no commission: the commission route refuses it, and a commission found on one is flagged", async () => {
    const t = await settle();
    d.raw.query("UPDATE site SET key_hash=? WHERE host=?").run(await sha("site-key"), ITS_HOST);
    const res = await commissionRoute({ request: new Request("https://x/api/pay/commission", { method: "POST", headers: { "x-site-key": "site-key" }, body: JSON.stringify({ site: ITS_HOST, site_ref: "c1", rzp_payment_id: t.id, partner_code: "P1", amount_minor: 10, status: "accrued" }) }), env });
    expect(res.status).toBe(422);
    expect(row("SELECT COUNT(*) AS n FROM payout").n).toBe(0);
    d.raw.query("INSERT INTO payout(id,site,stream,plan,payee_ref,amount_minor,source_payment_id,status,site_ref,created_ms,updated_ms) VALUES('po1',?,'refer_and_earn','partner','P1',10,?,'planned','c1',1,1)").run(ITS_HOST, t.id);
    expect(rows("SELECT issue FROM ledger_issues").map((r) => r.issue)).toEqual(["commission_on_test_payment"]);
  });
  test("a real sale still earns commission", async () => {
    sale("pay_S1", "pay_1");
    d.raw.query("UPDATE site SET key_hash=? WHERE host='corporate-bingo.pages.dev'").run(await sha("bk"));
    const res = await commissionRoute({ request: new Request("https://x/api/pay/commission", { method: "POST", headers: { "x-site-key": "bk" }, body: JSON.stringify({ site: "corporate-bingo.pages.dev", site_ref: "c1", rzp_payment_id: "pay_S1", partner_code: "P1", amount_minor: 100, status: "accrued" }) }), env });
    expect(res.status).toBe(200);
  });
  test("a game's own payment test sent through the site-key verify route is flagged as a test too", async () => {
    d.raw.query("UPDATE site SET key_hash=? WHERE host='corporate-bingo.pages.dev'").run(await sha("bk"));
    const o = { id: "order_G9", notes: {}, amount: 100 };
    d.raw.query("INSERT INTO pay_order(rzp_order_id,site,stream,product,plan,site_payment_ref,currency,amount_minor,status,created_ms,txn_id) VALUES('order_G9','corporate-bingo.pages.dev','sales','corporate_bingo','payment_test','pay_g9','INR',100,'created',1,'BNG-pay_g9')").run();
    const pay = payFor(o, { id: "pay_G9", notes: { site: "corporate-bingo.pages.dev" } }); rzp.set(pay.id, pay);
    const res = await verifySiteRoute({ request: new Request("https://x/api/pay/verify", { method: "POST", headers: { "x-site-key": "bk" }, body: JSON.stringify({ site: "corporate-bingo.pages.dev", razorpay_order_id: "order_G9", razorpay_payment_id: "pay_G9", razorpay_signature: sign("order_G9", "pay_G9") }) }), env });
    expect(res.status).toBe(200);
    expect(row("SELECT is_test, product_type FROM payment WHERE rzp_payment_id='pay_G9'")).toMatchObject({ is_test: 1, product_type: "payment_test" });
    expect(rows("SELECT * FROM pnl_lines WHERE rzp_payment_id='pay_G9'").length).toBe(0);
  });
  test("the owner view lists the tests on their own, and the migration marks earlier game tests", async () => {
    await settle();
    const res = await ledgerRoute({ request: new Request("https://x/api/pay/ledger?view=payment_tests", { headers: { authorization: "Bearer lk" } }), env });
    const list = await res.json();
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({ site: ITS_HOST, test_from: "COA", status: "paid", amount: 1 });
    expect((await ledgerRoute({ request: new Request("https://x/api/pay/ledger?view=payment_tests"), env })).status).toBe(404);
  });
});

describe("the owner report", () => {
  const T0 = Date.UTC(2026, 9, 14, 8, 0, 0);
  async function reportWith(c) {
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,stream,plan,product,product_type,site_payment_ref,status,currency,amount_minor,created_ms,captured_ms,updated_ms,fee_minor,tax_minor,txn_id,is_test) VALUES('pay_S1','corporate-bingo.pages.dev','sales','bingo_pack_100','corporate_bingo','game_pack','pay_1','paid','INR',239900,?,?,?,5660,863,'BNG-pay_1',0)").run(T0, T0, T0);
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,stream,plan,product,product_type,site_payment_ref,status,currency,amount_minor,created_ms,captured_ms,updated_ms,fee_minor,tax_minor,txn_id,is_test,test_from) VALUES('pay_T1','corporate-bingo.pages.dev','sales','payment_test','corporate_bingo','payment_test','pay_t1','paid','INR',100,?,?,?,236,36,'BNG-pay_t1',1,NULL)").run(T0, T0, T0);
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,stream,plan,product,product_type,site_payment_ref,status,currency,amount_minor,created_ms,captured_ms,updated_ms,fee_minor,tax_minor,txn_id,is_test,test_from) VALUES('pay_T2',?,'sales','payment_test','payment_test','payment_test','pt_a','paid','INR',100,?,?,?,236,36,'ITS-pt_a',1,'IDX')").run(ITS_HOST, T0, T0, T0);
    d.raw.query("INSERT INTO site_summary(site,period_key,currency,paid_count,failed_count,revenue_minor,reported_ms) VALUES('corporate-bingo.pages.dev','2026-10','INR',?,0,?,1)").run(c.n, c.rev);
    const rep = await buildReport(env, "monthly", T0 + 3600_000);
    return rep.markdown;
  }
  test("shows a separate 'payment tests' line and keeps the test out of revenue", async () => {
    const md = await reportWith({ n: 1, rev: 239900 });
    expect(md).toContain("B. Payment tests (Rs 1, buy nothing, not sales)");
    const sec = md.split("## B. Payment tests")[1].split("\n## ")[0];
    expect(sec).toMatch(/IDX/);
    expect(sec).toMatch(/Rs 1\.00/);
    const pnl = md.split("## B. Profit and loss")[1].split("\n## ")[0];
    expect(pnl).toContain("Rs 2,399.00");
    expect(pnl).not.toContain("Rs 2,400.00");
    expect(pnl).not.toMatch(/IT Services \(payment test\)/);
  });
  test("the A / B / C check says 'match' when C leaves its test out, and also when C counts it; a real difference is still 'DIFFERENT'", async () => {
    let md = await reportWith({ n: 1, rev: 239900 });
    const abcLine = (m) => m.split("## A / B / C check")[1].split("\n## ")[0].split("\n").find((l) => l.startsWith("| Corporate Bingo |"));
    let line = abcLine(md);
    expect(line).toContain("(+1 payment tests)");
    expect(line).toContain("| match |");
    d.raw.query("DELETE FROM payment").run(); d.raw.query("DELETE FROM site_summary").run();
    md = await reportWith({ n: 2, rev: 240000 });
    line = abcLine(md);
    expect(line).toContain("match (counts its payment tests)");
    d.raw.query("DELETE FROM payment").run(); d.raw.query("DELETE FROM site_summary").run();
    md = await reportWith({ n: 5, rev: 1 });
    expect(abcLine(md)).toContain("DIFFERENT");
  });
  test("the ledger problem list in the report stays empty with tests in the books", async () => {
    const md = await reportWith({ n: 1, rev: 239900 });
    expect(md.split("## Ledger problems")[1].split("\n## ")[0]).toContain("_none_");
  });
});

describe("the page and its wiring", () => {
  test("the footer link on COA, IDX and DPD names the site it comes from; ITS has its own", async () => {
    const { readFileSync } = await import("node:fs");
    const ufooter = readFileSync(new URL("../tools/ufooter.py", import.meta.url), "utf8");
    for (const c of ["COA", "IDX", "DPD"]) expect(ufooter).toContain(`/paytest/?from=${c}`);
    expect(ufooter).toContain('"pay": "/paytest/?from=ITS"');
  });
});

process.on("exit", () => { globalThis.fetch = realFetch; });
