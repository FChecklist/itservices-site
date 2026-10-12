import { json, readJson, authSite, rzpFetch, razorpayReady } from "../../_lib.js";
// POST /api/pay/order   header x-site-key: <the website's key>
// A website asks the central service to open a Razorpay order for ONE sale (money in). The central service tags it with the ledger path
// (website / stream / plan) so every rupee lands in the one Razorpay ledger. Body:
//   { site, product, plan, amount_minor, currency: "INR"|"USD", payment_ref, user?, payer_email?, payer_phone?, label? }
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b) return json({ error: "bad request" }, 400);
  const site = await authSite(request, env, b.site);
  if (!site) return json({ error: "unknown site or wrong key" }, 401);
  if (!razorpayReady(env)) return json({ error: "payments are not configured" }, 503);
  const amount = Number(b.amount_minor), cur = String(b.currency ?? "");
  if (!Number.isInteger(amount) || amount < 100 || amount > 5_000_000_00) return json({ error: "bad amount" }, 400);
  if (cur !== "INR" && cur !== "USD") return json({ error: "bad currency" }, 400);
  const product = String(b.product ?? "").slice(0, 60), plan = String(b.plan ?? "").slice(0, 60), ref = String(b.payment_ref ?? "").slice(0, 60);
  if (!product || !plan || !ref) return json({ error: "product, plan and payment_ref are required" }, 400);
  const user = b.user ? String(b.user).slice(0, 80) : "";
  const notes = { site: site.host, stream: "sales", product, plan, variation: plan, payment_ref: ref, ...(user ? { user } : {}), ...(b.label ? { label: String(b.label).slice(0, 80) } : {}) };
  let order;
  try { order = await rzpFetch(env, "/orders", { method: "POST", body: JSON.stringify({ amount, currency: cur, receipt: ref.slice(0, 40), notes }) }); }
  catch (e) { return json({ error: String(e.message ?? e).slice(0, 200) }, 502); }
  const now = Date.now();
  await env.DB.prepare("INSERT OR IGNORE INTO pay_order(rzp_order_id,site,stream,product,plan,site_payment_ref,payer_user,payer_email,payer_phone,currency,amount_minor,status,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(order.id, site.host, "sales", product, plan, ref, user || null, b.payer_email ? String(b.payer_email).slice(0, 200) : null, b.payer_phone ? String(b.payer_phone).slice(0, 30) : null, cur, amount, "created", now).run();
  return json({ ok: true, keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount_minor: amount, currency: cur });
}
export const onRequest = () => new Response("Not found", { status: 404 });
