import { json, readJson, authSite, rzpFetch, razorpayReady, txnIdOf, MNP_HOST } from "../../_lib.js";
// POST /api/pay/credit-order   header x-site-key: <Moneypenny's key>.   Called ONLY by Moneypenny (the credit ledger). No game, console or browser calls this.
// Opens ONE Razorpay order for a credit pack bought for a game. Moneypenny decides the amount (its fixed pack price, from its own list);
// this service checks it is sane, files it, and returns what the payment window needs. Body:
//   { site, payment_ref (Moneypenny's own order id), mp_order_ref?, credits, amount_minor, currency: "INR"|"USD", payer_email, game_id? }
// Safe to call twice with the same payment_ref: the same Razorpay order comes back (a retry never makes a second order).
// The payer e-mail is fixed HERE and kept on the order; credit-verify and the webhook report this one, never one typed into the card window later.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b) return json({ error: "bad request" }, 400);
  const site = await authSite(request, env, b.site);
  if (!site || site.host !== MNP_HOST) return json({ error: "unknown site or wrong key" }, 401);
  if (!razorpayReady(env)) return json({ error: "payments are not configured" }, 503);
  const credits = Number(b.credits), amount = Number(b.amount_minor), cur = String(b.currency ?? "");
  if (!Number.isInteger(credits) || credits < 1 || credits > 1_000_000_000) return json({ error: "bad credits" }, 400);
  if (!Number.isInteger(amount) || amount < 100 || amount > 5_000_000_00) return json({ error: "bad amount" }, 400);
  if (cur !== "INR" && cur !== "USD") return json({ error: "bad currency" }, 400);
  const ref = String(b.payment_ref ?? "");
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(ref)) return json({ error: "bad payment_ref" }, 400);
  const payer = String(b.payer_email ?? "").trim().toLowerCase();
  if (!EMAIL.test(payer)) return json({ error: "bad payer e-mail" }, 400);
  if (b.game_id !== undefined && b.game_id !== null && b.game_id !== "" && !/^[A-Za-z0-9_-]{1,40}$/.test(String(b.game_id))) return json({ error: "bad game id" }, 400);
  const gameId = b.game_id ? String(b.game_id) : "";
  const plan = `credits_${credits}`;
  // a repeat of the same Moneypenny order returns the same Razorpay order
  const prior = await env.DB.prepare("SELECT * FROM pay_order WHERE site=? AND site_payment_ref=?").bind(site.host, ref).first();
  if (prior) {
    if (prior.amount_minor !== amount || prior.currency !== cur || prior.plan !== plan || (prior.payer_email ?? "") !== payer) return json({ error: "this payment_ref was used for a different order" }, 409);
    return json({ ok: true, txn_id: prior.txn_id, keyId: env.RAZORPAY_KEY_ID, orderId: prior.rzp_order_id, amount_minor: prior.amount_minor, currency: prior.currency, repeat: true });
  }
  const txn = txnIdOf(site.host, ref);
  const notes = { site: site.host, stream: "sales", product: "moneypenny_credits", plan, variation: plan, payment_ref: ref, credits: String(credits), ...(gameId ? { game_id: gameId } : {}), ...(txn ? { txn_id: txn } : {}) };
  let order;
  try { order = await rzpFetch(env, "/orders", { method: "POST", body: JSON.stringify({ amount, currency: cur, receipt: ref.slice(0, 40), notes }) }); }
  catch (e) { return json({ error: String(e.message ?? e).slice(0, 200) }, 502); }
  await env.DB.prepare("INSERT OR IGNORE INTO pay_order(rzp_order_id,site,stream,product,plan,site_payment_ref,payer_user,payer_email,payer_phone,currency,amount_minor,status,created_ms,txn_id,game_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(order.id, site.host, "sales", "moneypenny_credits", plan, ref, null, payer, null, cur, amount, "created", Date.now(), txn, gameId || null).run();
  return json({ ok: true, txn_id: txn, keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount_minor: amount, currency: cur });
}
export const onRequest = () => new Response("Not found", { status: 404 });
