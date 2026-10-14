// Privacy of the central ledger (data audit items 1, 6 and 7): no raw payment message is stored, the nightly-copy views carry no payer contact data,
// and the retention job removes exactly what is past its period (and does nothing unless switched on). Run: bun test
import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { makeD1 } from "./d1-sqlite.js";
import { handleRazorpayWebhook } from "../functions/_central.js";
import { runRetention, RETENTION } from "../functions/_retention.js";
import { onRequestGet as ledgerRoute } from "../functions/api/pay/ledger.js";
import { onRequestPost as retentionRoute } from "../functions/api/pay/retention.js";

const DAY = 86400_000, NOW = Date.UTC(2026, 9, 14, 6, 0, 0);
let d, env;
beforeEach(() => { d = makeD1(); env = { DB: d.db, RAZORPAY_WEBHOOK_SECRET: "whsec", LEDGER_KEY: "lk", RECONCILE_KEY: "rk" }; });
const row = (sql, ...a) => d.raw.query(sql).get(...a);
const rows = (sql, ...a) => d.raw.query(sql).all(...a);
const cols = (view) => rows(`PRAGMA table_info(${view})`).map((c) => c.name);
const ledger = async (view) => JSON.parse(await (await ledgerRoute({ request: new Request("https://x/api/pay/ledger?view=" + view, { headers: { authorization: "Bearer lk" } }), env })).text());

describe("no raw payment message is kept", () => {
  test("a webhook that fails the signature check is logged by its ids only, never by its body", async () => {
    const ev = JSON.stringify({ id: "evt1", event: "payment.captured", created_at: 1, payload: { payment: { entity: { id: "pay_X1", order_id: "order_1", amount: 100, currency: "INR", email: "buyer@example.com", contact: "+919999999999", vpa: "buyer@upi", notes: { site: "corporate-bingo.pages.dev" } } } } });
    const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response("{}", { status: 200 }); // the pass-on to the website is replaced by a stand-in
    let res; try { res = await handleRazorpayWebhook(new Request("https://x/api/pay/webhook", { method: "POST", headers: { "x-razorpay-signature": "f".repeat(64) }, body: ev }), env, "corporate-tambola.pages.dev"); } finally { globalThis.fetch = realFetch; }
    expect([200, 400, 404, 502]).toContain(res.status);
    const w = row("SELECT * FROM webhook_log");
    expect(w).toMatchObject({ rzp_payment_id: "pay_X1", signature_ok: 0, event: "payment.captured" });
    expect(w.raw_body).toBeNull();
    expect((w.raw_sig ?? "").length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(w)).not.toMatch(/buyer@|9999999999/);
  });
});

describe("the views behind the nightly GitHub copy", () => {
  beforeEach(() => {
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,stream,plan,status,currency,amount_minor,payer_user,payer_email,payer_phone,created_ms,captured_ms,updated_ms,txn_id,site_payment_ref,fee_minor) VALUES('pay_1','corporate-bingo.pages.dev','sales','bingo_pack_100','paid','INR',239900,'Asha Rao','asha@example.com','+919999999999',?,?,?,'BNG-1','1',100)").run(NOW, NOW, NOW);
    d.raw.query("INSERT INTO webhook_log(received_ms,event,rzp_payment_id,site,signature_ok,outcome,raw_body,raw_sig) VALUES(?,?,?,?,?,?,?,?)").run(NOW, "payment.captured", "pay_1", "corporate-bingo.pages.dev", 0, "bad signature here", '{"email":"asha@example.com"}', "sig");
    d.raw.query("INSERT INTO payout(id,site,stream,plan,payee_ref,payee_name,amount_minor,status,paid_ms,created_ms,updated_ms,source_payment_id) VALUES('po1','corporate-bingo.pages.dev','refer_and_earn','partner','P1','Partner One',100,'paid',?,?,?,'pay_1')").run(NOW, NOW, NOW);
  });
  test("view=payments, master and webhooks hold no payer name, e-mail, mobile or raw message", async () => {
    for (const v of ["payments", "master", "webhooks"]) {
      const text = JSON.stringify(await ledger(v));
      expect(text).not.toMatch(/asha@example\.com|9999999999|Asha Rao|raw_body|raw_sig|payer_email|payer_phone|payer_user/);
      expect(text.length).toBeGreaterThan(20);
    }
    for (const view of ["payment_ledger", "master_ledger_safe", "webhook_log_safe"]) expect(cols(view).join()).not.toMatch(/payer_|raw_|party_ref$/);
  });
  test("money-in lines of the master copy have no party; money-out lines keep the payee", async () => {
    const m = await ledger("master");
    expect(m.find((r) => r.direction === "in")).toMatchObject({ party: null, party_ref: null, amount: 2399 });
    expect(m.find((r) => r.direction === "out")).toMatchObject({ party: "Partner One", party_ref: "P1" });
  });
  test("the owner can still look up who paid with the live-only view, which is not one of the copied views", async () => {
    const c = await ledger("payments_contact");
    expect(c[0]).toMatchObject({ rzp_payment_id: "pay_1", payer_email: "asha@example.com", payer_phone: "+919999999999" });
    const backupViews = "payments refunds payouts expenses webhooks master pnl_summary issues recon".split(" ");
    expect(backupViews).not.toContain("payments_contact");
  });
});

describe("retention (not switched on): billing data is never removed", () => {
  const pay = (id, status, ageDays) => d.raw.query("INSERT INTO payment(rzp_payment_id,rzp_order_id,site,status,currency,amount_minor,payer_user,payer_email,payer_phone,notes,created_ms,captured_ms,updated_ms) VALUES(?,?,?,?,'INR',100,'Asha','a@example.com','+919999999999','{\"x\":1}',?,?,?)").run(id, "order_" + id, "corporate-bingo.pages.dev", status, NOW - ageDays * DAY, status === "paid" ? NOW - ageDays * DAY : null, NOW);
  const ord = (id, status, ageDays) => d.raw.query("INSERT INTO pay_order(rzp_order_id,site,stream,plan,payer_user,payer_email,currency,amount_minor,status,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, "corporate-bingo.pages.dev", "sales", "p", "Asha", "a@example.com", "INR", 100, status, NOW - ageDays * DAY);
  const snapshot = () => JSON.stringify([rows("SELECT * FROM payment"), rows("SELECT * FROM pay_order WHERE rzp_order_id<>'order_old_unpaid'"), rows("SELECT * FROM webhook_log"), rows("SELECT * FROM recon_run"), rows("SELECT * FROM report_log"), rows("SELECT * FROM refund"), rows("SELECT * FROM payout"), rows("SELECT * FROM expense")]);
  beforeEach(() => {
    ord("order_old_unpaid", "created", 400); ord("order_new_unpaid", "created", 5); ord("order_old_paid", "paid", 4000); ord("order_old_failed_try", "created", 400);
    pay("pay_old_failed_try", "failed", 400); pay("pay_old_paid", "paid", 4000); pay("pay_9y_paid", "paid", 9 * 366); pay("pay_old_created", "created", 400);
    d.raw.query("UPDATE pay_order SET rzp_order_id='order_pay_old_failed_try' WHERE rzp_order_id='order_old_failed_try'").run();
    d.raw.query("INSERT INTO webhook_log(received_ms,event,signature_ok,outcome) VALUES(?,?,?,?)").run(NOW - 1000 * DAY, "e", 1, "ok");
    d.raw.query("INSERT INTO recon_run(run_ms,days,razorpay_seen,filed) VALUES(?,?,?,?)").run(NOW - 900 * DAY, 3, 0, 0);
    d.raw.query("INSERT INTO report_log(made_ms,kind) VALUES(?,?)").run(NOW - 900 * DAY, "daily");
    d.raw.query("INSERT INTO refund(rzp_refund_id,rzp_payment_id,amount_minor,status,created_ms,updated_ms) VALUES('rfnd_1','pay_old_paid',100,'processed',?,?)").run(NOW - 3000 * DAY, NOW);
    d.raw.query("INSERT INTO payout(id,site,stream,plan,payee_ref,amount_minor,status,created_ms,updated_ms) VALUES('po1','corporate-bingo.pages.dev','refer_and_earn','partner','P1',10,'paid',?,?)").run(NOW - 3000 * DAY, NOW);
  });
  test("the one period is stated in the Privacy Policy, together with the billing sentence", () => {
    expect(RETENTION).toEqual({ unpaid_order_days: 30 });
    const policy = readFileSync(new URL("../build.py", import.meta.url), "utf8");
    expect(policy).toContain("An order that was not paid:</b> 30 days"); expect(policy).toContain("We keep billing data for audit and tax reasons.");
    expect(policy).not.toMatch(/forever|permanent|for ever\b|8 years|13 months/i);
  });
  test("a dry run counts and changes nothing", async () => {
    const before = snapshot(), all = JSON.stringify(rows("SELECT * FROM pay_order"));
    expect(await runRetention(env, { apply: false, now: NOW })).toEqual({ unpaid_orders_deleted: 1 });
    expect(snapshot()).toBe(before); expect(JSON.stringify(rows("SELECT * FROM pay_order"))).toBe(all);
  });
  test("applying deletes only the old order that never had a payment; every payment, invoice record, log and ledger row stays exactly as it was", async () => {
    const before = snapshot();
    expect(await runRetention(env, { apply: true, now: NOW })).toEqual({ unpaid_orders_deleted: 1 });
    expect(rows("SELECT rzp_order_id FROM pay_order ORDER BY 1").map((r) => r.rzp_order_id)).toEqual(["order_new_unpaid", "order_old_paid", "order_pay_old_failed_try"]);
    expect(snapshot()).toBe(before);
    expect(row("SELECT payer_email, payer_phone, notes FROM payment WHERE rzp_payment_id='pay_9y_paid'")).toEqual({ payer_email: "a@example.com", payer_phone: "+919999999999", notes: '{"x":1}' });
    expect((await runRetention(env, { apply: true, now: NOW })).unpaid_orders_deleted).toBe(0);
  });
  const call = (qs, key = "rk", e = env) => retentionRoute({ request: new Request("https://x/api/pay/retention" + qs, { method: "POST", headers: { "x-reconcile-key": key } }), env: e });
  test("the route is private, counts only by default, and deletes only with apply=1 AND RETENTION_LIVE=1", async () => {
    expect((await call("", "wrong")).status).toBe(404);
    expect(await (await call("?apply=1")).json()).toMatchObject({ ok: true, live: false, applied: false, dry_run: true });
    expect(rows("SELECT * FROM pay_order").length).toBe(4);
    expect(await (await call("", "rk", { ...env, RETENTION_LIVE: "1" })).json()).toMatchObject({ applied: false });
    expect(rows("SELECT * FROM pay_order").length).toBe(4);
    expect(await (await call("?apply=1", "rk", { ...env, RETENTION_LIVE: "1" })).json()).toMatchObject({ live: true, applied: true, dry_run: false });
    expect(rows("SELECT * FROM pay_order").length).toBe(3);
  });
});
