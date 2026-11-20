// Moneypenny credit orders (owner order 20 Nov 2026): credit-order / credit-verify are callable ONLY by Moneypenny;
// a captured payment is pushed to Moneypenny once per payment id (webhook backup + scheduled run). Real migrations in an in-memory SQLite;
// Razorpay and Moneypenny are stand-ins. No live call, no real money.
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { makeD1 } from "./d1-sqlite.js";
import { MNP_HOST, SITE_CODES } from "../functions/_lib.js";
import { onRequestPost as orderRoute } from "../functions/api/pay/credit-order.js";
import { onRequestPost as verifyRoute } from "../functions/api/pay/credit-verify.js";
import { onRequestPost as runRoute } from "../functions/api/pay/credit-outbox-run.js";
import { onRequestPost as plainOrderRoute } from "../functions/api/pay/order.js";
import { handleRazorpayWebhook } from "../functions/_central.js";

const SECRET = "test_secret_value", WH = "whsec_test", BINGO = "corporate-bingo.pages.dev", MNP_SECRET = "mnp-purchase-secret", RK = "recon-key";
const sign = (o, p) => createHmac("sha256", SECRET).update(`${o}|${p}`).digest("hex");
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (x) => x.toString(16).padStart(2, "0")).join("");
let d, env, orders, rzp, seq, mnp, realFetch = globalThis.fetch;
const row = (sql, ...a) => d.raw.query(sql).get(...a);
const rows = (sql, ...a) => d.raw.query(sql).all(...a);
const body = (o = {}) => ({ site: MNP_HOST, payment_ref: "ord_AAA", mp_order_ref: "gp:G1:1", credits: 3400, amount_minor: 239900, currency: "INR", payer_email: "org@example.com", game_id: "G1", ...o });
const call = (route, b, key = "mk") => route({ request: new Request("https://x/api/pay/x", { method: "POST", headers: { "x-site-key": key }, body: JSON.stringify(b) }), env });
const order = (b, key) => call(orderRoute, b, key);
const verifyBody = (o = {}) => ({ site: MNP_HOST, razorpay_order_id: "order_G1", razorpay_payment_id: "pay_G1", razorpay_signature: sign("order_G1", "pay_G1"), ...o });
const captured = (o = {}) => ({ id: "pay_G1", order_id: "order_G1", amount: 239900, currency: "INR", status: "captured", method: "upi", email: "typed.in.card.window@other.in", created_at: 1, notes: { site: MNP_HOST, game_id: "G1" }, ...o });
const hook = (pay, id = "evt1") => {
  const ev = JSON.stringify({ id, event: "payment.captured", created_at: 1, payload: { payment: { entity: pay } } });
  return handleRazorpayWebhook(new Request("https://x/api/pay/webhook", { method: "POST", headers: { "x-razorpay-signature": createHmac("sha256", WH).update(ev).digest("hex"), "x-razorpay-event-id": id }, body: ev }), env, "corporate-tambola.pages.dev");
};
const run = () => runRoute({ request: new Request("https://x/api/pay/credit-outbox-run", { method: "POST", headers: { "x-reconcile-key": RK } }), env });

beforeEach(async () => {
  d = makeD1(); orders = []; rzp = new Map(); seq = 0; mnp = { calls: [], status: 200, down: false };
  env = { DB: d.db, RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: WH, RECONCILE_KEY: RK, MNP_BASE_URL: "https://moneypenny.example", MNP_KEY_ID: "mk_purchase", MNP_KEY_SECRET: MNP_SECRET };
  d.raw.query("UPDATE site SET key_hash=?, active=1 WHERE host=?").run(await sha("mk"), MNP_HOST);
  d.raw.query("UPDATE site SET key_hash=? WHERE host=?").run(await sha("bk"), BINGO);
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith("https://moneypenny.example")) {
      if (mnp.down) throw new Error("connection refused");
      mnp.calls.push({ url, headers: init.headers, body: JSON.parse(init.body), raw: init.body });
      return json(mnp.status === 200 ? { ok: true } : { ok: false, error: { code: "payer_mismatch" } }, mnp.status);
    }
    if (url.endsWith("/v1/orders") && init.method === "POST") { const b = JSON.parse(init.body); const o = { id: "order_G" + ++seq, ...b }; orders.push(o); return json(o); }
    const m = url.match(/\/payments\/(pay_\w+)$/);
    if (m) return rzp.has(m[1]) ? json(rzp.get(m[1])) : json({ error: { description: "not found" } }, 404);
    return json({ error: { description: "unexpected " + url } }, 500);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("credit-order: Moneypenny only", () => {
  test("Moneypenny's key opens a credit order: Razorpay order with game id and plan, payer fixed on the order, ledger row filed", async () => {
    const res = await order(body());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.orderId).toBe("order_G1");
    expect(j.keyId).toBe("rzp_test_abc");
    expect(j.txn_id).toBe("MNP-ord_AAA");
    expect(orders[0].amount).toBe(239900);
    expect(orders[0].notes).toMatchObject({ site: MNP_HOST, plan: "credits_3400", game_id: "G1", product: "moneypenny_credits" });
    const r = row("SELECT * FROM pay_order WHERE rzp_order_id='order_G1'");
    expect([r.site, r.payer_email, r.game_id, r.site_payment_ref, r.amount_minor]).toEqual([MNP_HOST, "org@example.com", "G1", "ord_AAA", 239900]);
  });
  test("no game, console or browser can call it: another website's key, a wrong key, a missing key, and a site row that is not yet switched on", async () => {
    expect((await order(body({ site: BINGO }), "bk")).status).toBe(401); // a game's own valid key is not enough
    expect((await order(body(), "wrong")).status).toBe(401);
    expect((await order(body(), "")).status).toBe(401);
    d.raw.query("UPDATE site SET active=0 WHERE host=?").run(MNP_HOST);
    expect((await order(body())).status).toBe(401);
    expect(orders.length).toBe(0);
    expect((await call(verifyRoute, verifyBody({ site: BINGO }), "bk")).status).toBe(401);
    expect((await call(verifyRoute, verifyBody(), "wrong")).status).toBe(401);
  });
  test("migration 0015 ships the Moneypenny site row INACTIVE and keyless: nothing works until the owner issues a key", () => {
    const fresh = makeD1();
    const s = fresh.raw.query("SELECT active, key_hash FROM site WHERE host=?").get(MNP_HOST);
    expect([s.active, s.key_hash]).toEqual([0, null]);
    expect(SITE_CODES[MNP_HOST]).toBe("MNP");
  });
  test("the same Moneypenny order twice is the same Razorpay order; a different amount under the same id is refused", async () => {
    const a = await (await order(body())).json();
    const b = await (await order(body())).json();
    expect(b.orderId).toBe(a.orderId);
    expect(b.repeat).toBe(true);
    expect(orders.length).toBe(1);
    expect((await order(body({ amount_minor: 100 }))).status).toBe(409);
    expect((await order(body({ payer_email: "other@example.com" }))).status).toBe(409);
  });
  test("odd input is refused: currency, tiny amount, bad e-mail, bad ids, bad credits", async () => {
    for (const bad of [{ currency: "EUR" }, { amount_minor: 99 }, { amount_minor: 1.5 }, { payer_email: "nope" }, { payment_ref: "a b" }, { game_id: "a b" }, { credits: 0 }]) expect((await order(body(bad))).status).toBe(400);
    expect(orders.length).toBe(0);
  });
  test("the old direct order route still works for a game (nothing else changed)", async () => {
    const res = await plainOrderRoute({ request: new Request("https://x/api/pay/order", { method: "POST", headers: { "x-site-key": "bk" }, body: JSON.stringify({ site: BINGO, product: "corporate_bingo", plan: "bingo_pack_100", amount_minor: 239900, currency: "INR", payment_ref: "pay_1" }) }), env });
    expect(res.status).toBe(200);
  });
});

describe("credit-verify: the facts Moneypenny needs", () => {
  beforeEach(async () => { await order(body()); });
  test("paid: answers amount, currency, Moneypenny's order id and the e-mail FIXED at order time (not the one typed in the card window)", async () => {
    rzp.set("pay_G1", captured());
    const res = await call(verifyRoute, verifyBody());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, paid: true, amount_minor: 239900, currency: "INR", payment_ref: "ord_AAA", order_payer_email: "org@example.com", game_id: "G1", razorpay_payment_id: "pay_G1" });
    expect(row("SELECT status, game_id FROM payment WHERE rzp_payment_id='pay_G1'")).toMatchObject({ status: "paid", game_id: "G1" });
  });
  test("not paid yet, a wrong signature, a payment for another amount: no credit facts", async () => {
    rzp.set("pay_G1", captured({ status: "created" }));
    expect((await (await call(verifyRoute, verifyBody())).json()).paid).toBe(false);
    expect((await call(verifyRoute, verifyBody({ razorpay_signature: "bad" }))).status).toBe(400);
    rzp.set("pay_G1", captured({ amount: 100 }));
    expect((await call(verifyRoute, verifyBody())).status).toBe(409);
  });
  test("safe to call again", async () => {
    rzp.set("pay_G1", captured());
    await call(verifyRoute, verifyBody());
    const again = await (await call(verifyRoute, verifyBody())).json();
    expect(again.paid).toBe(true);
    expect(rows("SELECT * FROM payment WHERE rzp_payment_id='pay_G1'").length).toBe(1);
  });
});

describe("the push to Moneypenny (webhook backup, closed tab)", () => {
  beforeEach(async () => { await order(body()); });
  test("a captured payment is told to Moneypenny once, signed with the purchase key, naming the order's payer and the real amount", async () => {
    const res = await hook(captured());
    expect(res.status).toBe(200);
    expect(mnp.calls.length).toBe(1);
    const c = mnp.calls[0];
    expect(c.url).toBe("https://moneypenny.example/v1/game_pay/payment_confirmed");
    expect(c.body).toEqual({ order_id: "ord_AAA", payment_ref: "pay_G1", paid_minor: 239900, currency: "INR", payer_email: "org@example.com" });
    const h = c.headers;
    expect(h["x-mnp-key"]).toBe("mk_purchase");
    expect(h["idempotency-key"]).toBe("pay:/v1/game_pay/payment_confirmed:pay_G1");
    const expect_sig = createHmac("sha256", MNP_SECRET).update([h["x-mnp-timestamp"], h["x-mnp-nonce"], "POST", "/v1/game_pay/payment_confirmed", await sha(c.raw), h["idempotency-key"]].join("\n")).digest("hex");
    expect(h["x-mnp-signature"]).toBe(expect_sig);
    expect(row("SELECT status, attempts FROM credit_outbox WHERE rzp_payment_id='pay_G1'")).toEqual({ status: "sent", attempts: 1 });
  });
  test("the same webhook or payment again (new event id, verify path, scheduled run) never sends a second time", async () => {
    await hook(captured(), "evt1");
    await hook(captured(), "evt2"); // Razorpay sends the same payment under another event id
    rzp.set("pay_G1", captured());
    await call(verifyRoute, verifyBody());
    await run();
    expect(mnp.calls.length).toBe(1);
    expect(rows("SELECT * FROM credit_outbox").length).toBe(1);
  });
  test("Moneypenny down: the webhook still answers 200, the row waits, the scheduled run delivers it when Moneypenny is back, once", async () => {
    mnp.down = true;
    expect((await hook(captured())).status).toBe(200);
    expect(row("SELECT status, attempts FROM credit_outbox WHERE rzp_payment_id='pay_G1'")).toEqual({ status: "pending", attempts: 1 });
    mnp.down = false;
    expect((await (await run()).json()).sent).toBe(0); // too early: back-off
    d.raw.query("UPDATE credit_outbox SET next_ms=0").run();
    const r = await (await run()).json();
    expect(r.sent).toBe(1);
    expect(row("SELECT status FROM credit_outbox").status).toBe("sent");
    expect((await (await run()).json()).sent).toBe(0);
    expect(mnp.calls.length).toBe(1);
  });
  test("Moneypenny refuses it (wrong payer, mismatch): the row is marked dead for a person, never hammered", async () => {
    mnp.status = 409;
    await hook(captured());
    expect(row("SELECT status, last_error FROM credit_outbox")).toEqual({ status: "dead", last_error: "payer_mismatch" });
    d.raw.query("UPDATE credit_outbox SET next_ms=0").run();
    await run();
    expect(mnp.calls.length).toBe(1);
    expect((await (await run()).json()).dead_total).toBe(1);
  });
  test("a missed webhook is found by the scheduled run (payment filed by verify or reconcile, never pushed)", async () => {
    rzp.set("pay_G1", captured());
    await call(verifyRoute, verifyBody()); // filed, but no webhook ever came
    expect(mnp.calls.length).toBe(0);
    const r = await (await run()).json();
    expect(r.queued).toBe(1);
    expect(r.sent).toBe(1);
    expect(mnp.calls[0].body.payment_ref).toBe("pay_G1");
  });
  test("other websites' payments are never pushed; the scheduled run needs its key", async () => {
    const pay = { id: "pay_B1", order_id: "order_B1", amount: 239900, currency: "INR", status: "captured", method: "upi", created_at: 1, notes: { site: BINGO, product: "corporate_bingo", variation: "bingo_pack_100", payment_ref: "p9" } };
    await hook(pay, "evt9");
    expect(mnp.calls.length).toBe(0);
    expect(rows("SELECT * FROM credit_outbox").length).toBe(0);
    expect((await runRoute({ request: new Request("https://x/api/pay/credit-outbox-run", { method: "POST", headers: { "x-reconcile-key": "wrong" } }), env })).status).toBe(404);
  });
  test("without Moneypenny's key set here nothing is sent and the row waits", async () => {
    delete env.MNP_KEY_SECRET;
    await hook(captured());
    expect(mnp.calls.length).toBe(0);
    expect(row("SELECT status FROM credit_outbox").status).toBe("pending");
  });
});

describe("the payment window", () => {
  test("console.corporatetambola.com may embed the payment window (source allow-list and frame-ancestors)", () => {
    const js = readFileSync(new URL("../dist/payframe/pay.js", import.meta.url), "utf8");
    expect(js).toContain('"https://console.corporatetambola.com"');
    const headers = readFileSync(new URL("../dist/_headers", import.meta.url), "utf8");
    const frame = headers.split("\n").filter((l) => l.includes("frame-ancestors") && l.includes("script-src 'self' https://checkout.razorpay.com")).join("\n");
    expect(frame).toContain("https://console.corporatetambola.com");
  });
});
