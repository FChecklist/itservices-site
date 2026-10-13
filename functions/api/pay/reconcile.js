import { json, rzpFetch, razorpayReady, same } from "../../_lib.js";
import { upsertPayment } from "../../_central.js";
// POST /api/pay/reconcile?days=3   header x-reconcile-key: <RECONCILE_KEY>   (called by the scheduler repository every 30 minutes)
// The ledger must not depend on a webhook being delivered: this asks Razorpay for the captured payments of the last few days and files every one
// that belongs to a registered website (notes.site) and is not yet in the ledger, as the same line the webhook would have written.
export async function onRequestPost({ request, env }) {
  if (!env.RECONCILE_KEY || !same(request.headers.get("x-reconcile-key") ?? "", env.RECONCILE_KEY)) return new Response("Not found", { status: 404 });
  if (!razorpayReady(env)) return json({ error: "payments are not configured" }, 503);
  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 3));
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const sites = new Set(((await env.DB.prepare("SELECT host FROM site").all()).results ?? []).map((r) => r.host));
  let seen = 0, filed = 0, other = 0, skip = 0;
  try {
    for (let page = 0; page < 20; page++) {
      const d = await rzpFetch(env, `/payments?from=${from}&count=100&skip=${skip}`);
      const items = d.items ?? [];
      for (const p of items) {
        seen++;
        if (p.status !== "captured") continue;
        const site = p.notes?.site;
        if (!site || !sites.has(site)) { other++; continue; }
        const have = await env.DB.prepare("SELECT status FROM payment WHERE rzp_payment_id=?").bind(p.id).first();
        if (have?.status === "paid") continue;
        await upsertPayment(env.DB, (p.created_at ?? Math.floor(Date.now() / 1000)) * 1000, { event: "payment.captured", payload: { payment: { entity: p } } }, site);
        if (p.order_id) await env.DB.prepare("UPDATE pay_order SET status='paid' WHERE rzp_order_id=? AND status<>'paid'").bind(p.order_id).run();
        filed++;
      }
      if (items.length < 100) break;
      skip += 100;
    }
  } catch (e) { return json({ error: String(e.message ?? e).slice(0, 200), seen, filed }, 502); }
  return json({ ok: true, days, seen, filed, not_ours: other });
}
export const onRequest = () => new Response("Not found", { status: 404 });
