import { json, authSite, MNP_HOST } from "../../_lib.js";
import { onRequestPost as verifyRoute } from "./verify.js";
// POST /api/pay/credit-verify   header x-site-key: <Moneypenny's key>.   Called ONLY by Moneypenny.
// Body: { site, razorpay_order_id, razorpay_payment_id, razorpay_signature }.
// Does exactly what /api/pay/verify does (checks Razorpay's signature, re-reads the payment from Razorpay, captures an authorised one, files it)
// and then answers with the facts Moneypenny needs to credit the right person once: paid, amount, currency, the order's own payer e-mail
// (fixed when the order was made, NOT the e-mail typed into the card window) and Moneypenny's order id. Safe to call again.
export async function onRequestPost({ request, env }) {
  const text = await request.text();
  let b = null; try { b = JSON.parse(text); } catch { /* bad request below */ }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  const site = await authSite(request, env, b.site);
  if (!site || site.host !== MNP_HOST) return json({ error: "unknown site or wrong key" }, 401);
  const res = await verifyRoute({ request: new Request(request.url, { method: "POST", headers: request.headers, body: text }), env });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json(out, res.status);
  const order = await env.DB.prepare("SELECT site_payment_ref, payer_email, game_id, txn_id FROM pay_order WHERE rzp_order_id=? AND site=?").bind(String(b.razorpay_order_id), site.host).first();
  if (!order) return json({ error: "unknown order for this site" }, 404);
  return json({ ok: true, paid: out.paid === true, status: out.status ?? null, razorpay_order_id: out.razorpay_order_id, razorpay_payment_id: out.razorpay_payment_id, amount_minor: out.amount_minor, currency: out.currency, payment_ref: order.site_payment_ref, order_payer_email: order.payer_email, game_id: order.game_id ?? null, txn_id: order.txn_id ?? null });
}
export const onRequest = () => new Response("Not found", { status: 404 });
