// The game ID travels with a game's payment: the website sends it to the central service, which puts it in the Razorpay order notes and in the
// ledger row (pay_order and payment, new nullable column game_id, migration 0014). Real migrations in an in-memory SQLite; Razorpay is a stand-in.
import { describe, expect, test, beforeEach } from "bun:test";
import { createHmac } from "node:crypto";
import { makeD1 } from "./d1-sqlite.js";
import { ITS_HOST } from "../functions/_lib.js";
import { onRequestPost as orderRoute } from "../functions/api/pay/order.js";
import { onRequestPost as verifyRoute } from "../functions/api/pay/verify.js";
import { handleRazorpayWebhook } from "../functions/_central.js";

const SECRET = "test_secret_value", WH = "whsec_test", SITE = "corporate-bingo.pages.dev";
const sign = (o, p) => createHmac("sha256", SECRET).update(`${o}|${p}`).digest("hex");
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (x) => x.toString(16).padStart(2, "0")).join("");
let d, env, orders, rzp, seq, realFetch = globalThis.fetch;
const row = (sql, ...a) => d.raw.query(sql).get(...a);
const body = (o) => ({ site: SITE, product: "corporate_bingo", plan: "bingo_pack_100", amount_minor: 239900, currency: "INR", payment_ref: "pay_1", ...o });
const order = (b) => orderRoute({ request: new Request("https://x/api/pay/order", { method: "POST", headers: { "x-site-key": "bk" }, body: JSON.stringify(b) }), env });

beforeEach(async () => {
  d = makeD1(); orders = []; rzp = new Map(); seq = 0;
  env = { DB: d.db, RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: WH };
  d.raw.query("UPDATE site SET key_hash=? WHERE host=?").run(await sha("bk"), SITE);
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.endsWith("/v1/orders") && init.method === "POST") { const b = JSON.parse(init.body); const o = { id: "order_G" + ++seq, ...b }; orders.push(o); return json(o); }
    const m = url.match(/\/payments\/(pay_\w+)$/);
    if (m) return rzp.has(m[1]) ? json(rzp.get(m[1])) : json({ error: { description: "not found" } }, 404);
    return json({ error: { description: "unexpected " + url } }, 500);
  };
});
import { afterEach } from "bun:test";
afterEach(() => { globalThis.fetch = realFetch; });

describe("the game ID in the central ledger", () => {
  test("the order carries the game ID in the Razorpay notes and keeps it in pay_order", async () => {
    const res = await order(body({ game_id: "G-7K2Q9" }));
    expect(res.status).toBe(200);
    expect(orders[0].notes.game_id).toBe("G-7K2Q9");
    expect(row("SELECT game_id FROM pay_order WHERE rzp_order_id='order_G1'").game_id).toBe("G-7K2Q9");
  });
  test("a payment without a game ID is as before (no note, empty column)", async () => {
    expect((await order(body({}))).status).toBe(200);
    expect(orders[0].notes.game_id).toBeUndefined();
    expect(row("SELECT game_id FROM pay_order WHERE rzp_order_id='order_G1'").game_id).toBeNull();
  });
  test("a game ID with odd characters or too long is refused, not stored", async () => {
    for (const bad of ["a b", "x".repeat(41), "<script>", "a;drop", 5.5]) expect((await order(body({ game_id: bad }))).status).toBe(400);
    expect(orders.length).toBe(0);
  });
  test("after the buyer pays (verify), the ledger row has the game ID", async () => {
    await order(body({ game_id: "G-7K2Q9" }));
    rzp.set("pay_G1", { id: "pay_G1", order_id: "order_G1", amount: 239900, currency: "INR", status: "captured", method: "upi", email: "a@b.in", notes: { game_id: "G-7K2Q9" } });
    const res = await verifyRoute({ request: new Request("https://x/api/pay/verify", { method: "POST", headers: { "x-site-key": "bk" }, body: JSON.stringify({ site: SITE, razorpay_order_id: "order_G1", razorpay_payment_id: "pay_G1", razorpay_signature: sign("order_G1", "pay_G1") }) }), env });
    expect(res.status).toBe(200);
    expect(row("SELECT game_id FROM payment WHERE rzp_payment_id='pay_G1'").game_id).toBe("G-7K2Q9");
  });
  test("Razorpay's own webhook (no verify call) also fills the game ID, from the order notes", async () => {
    const pay = { id: "pay_W1", order_id: "order_W1", amount: 239900, currency: "INR", status: "captured", method: "upi", created_at: 1, notes: { site: ITS_HOST, product: "corporate_bingo", variation: "bingo_pack_100", payment_ref: "pay_9", game_id: "G-AAA11" } };
    const ev = JSON.stringify({ id: "evt1", event: "payment.captured", created_at: 1, payload: { payment: { entity: pay } } });
    const res = await handleRazorpayWebhook(new Request("https://x/api/pay/webhook", { method: "POST", headers: { "x-razorpay-signature": createHmac("sha256", WH).update(ev).digest("hex"), "x-razorpay-event-id": "evt1" }, body: ev }), env, ITS_HOST);
    expect(res.status).toBe(200);
    expect(row("SELECT game_id FROM payment WHERE rzp_payment_id='pay_W1'").game_id).toBe("G-AAA11");
  });
  test("migration 0014 adds the nullable column to both tables and leaves old rows alone", () => {
    for (const t of ["payment", "pay_order"]) expect(d.raw.query(`PRAGMA table_info(${t})`).all().some((c) => c.name === "game_id" && !c.notnull)).toBe(true);
  });
});
