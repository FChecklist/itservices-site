import { json, rzpFetch, razorpayReady, same } from "../../_lib.js";
import { upsertPayment, upsertRefund } from "../../_central.js";
// POST /api/pay/reconcile?days=3   header x-reconcile-key: <RECONCILE_KEY>   (called by the scheduler repository every 30 minutes)
// Ledger A (Razorpay) is compared with ledger B (this one). The ledger never depends on a webhook arriving:
//   - every captured Razorpay payment that belongs to a registered website (notes.site) and is not yet filed is filed, with Razorpay's fee and tax;
//   - fee, tax and refunds are filled in for payments filed earlier;
//   - the answer (and the table recon_run) lists what does NOT match: Razorpay payments with no website, filed payments Razorpay does not show,
//     amount differences, and one website payment paid twice.
export async function onRequestPost({ request, env }) {
  if (!env.RECONCILE_KEY || !same(request.headers.get("x-reconcile-key") ?? "", env.RECONCILE_KEY)) return new Response("Not found", { status: 404 });
  if (!razorpayReady(env)) return json({ error: "payments are not configured" }, 503);
  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 3));
  // Optional body { claims: { "pay_...": { site, ref } } }: a Razorpay payment made before orders carried a website tag is filed under the website that took it (ref = that website's own payment id).
  let claims = {}; try { const b = await request.json(); if (b && typeof b.claims === "object" && b.claims) claims = b.claims; } catch { /* no body */ }
  const from = Math.floor(Date.now() / 1000) - days * 86400, now = Date.now();
  const sites = new Set(((await env.DB.prepare("SELECT host FROM site").all()).results ?? []).map((r) => r.host));
  const rz = new Map(); let seen = 0, filed = 0, refunds = 0; const unassigned = [], mismatch = [];
  try {
    for (let skip = 0, page = 0; page < 20; page++, skip += 100) {
      const d = await rzpFetch(env, `/payments?from=${from}&count=100&skip=${skip}`);
      const items = d.items ?? [];
      for (const p of items) {
        seen++; rz.set(p.id, p);
        if (p.status !== "captured" && p.status !== "refunded") continue;
        let site = p.notes?.site;
        if (!site) site = (await env.DB.prepare("SELECT site FROM payment WHERE rzp_payment_id=?").bind(p.id).first())?.site; // filed earlier under a website
        const cl = claims[p.id];
        if (!site && cl && typeof cl.site === "string" && sites.has(cl.site) && typeof cl.ref === "string") { site = cl.site; p.notes = { ...(Array.isArray(p.notes) ? {} : p.notes ?? {}), site: cl.site, payment_ref: cl.ref }; }
        if (!site || !sites.has(site)) { unassigned.push({ id: p.id, order: p.order_id ?? null, amount_minor: p.amount, at: p.created_at }); continue; }
        const have = await env.DB.prepare("SELECT status, amount_minor, fee_minor, refunded_minor FROM payment WHERE rzp_payment_id=?").bind(p.id).first();
        if (have && have.amount_minor !== p.amount) mismatch.push({ id: p.id, ledger: have.amount_minor, razorpay: p.amount });
        if (!have || have.status !== "paid" || have.fee_minor == null || (Number(p.amount_refunded) || 0) > have.refunded_minor) {
          await upsertPayment(env.DB, (p.created_at ?? Math.floor(now / 1000)) * 1000, { event: "payment.captured", payload: { payment: { entity: p } } }, site);
          if (!have) filed++;
        }
        if (p.order_id) await env.DB.prepare("UPDATE pay_order SET status='paid' WHERE rzp_order_id=? AND status<>'paid'").bind(p.order_id).run();
      }
      if (items.length < 100) break;
    }
    for (let skip = 0, page = 0; page < 10; page++, skip += 100) {
      const d = await rzpFetch(env, `/refunds?from=${from}&count=100&skip=${skip}`);
      const items = d.items ?? [];
      for (const r of items) { const owner = (await env.DB.prepare("SELECT site FROM payment WHERE rzp_payment_id=?").bind(r.payment_id).first())?.site; if (owner) { await upsertRefund(env.DB, r, owner); refunds++; } }
      if (items.length < 100) break;
    }
  } catch (e) { return json({ error: String(e.message ?? e).slice(0, 200), seen, filed }, 502); }
  const ours = ((await env.DB.prepare("SELECT rzp_payment_id FROM payment WHERE status='paid' AND captured_ms >= ? AND captured_ms < ?").bind(from * 1000, now - 3600_000).all()).results ?? []).map((r) => r.rzp_payment_id);
  const missing = ours.filter((id) => !rz.has(id));
  const dup = ((await env.DB.prepare("SELECT issue, site, ref, ids FROM ledger_issues WHERE issue='paid_twice_for_one_site_payment'").all()).results ?? []);
  await env.DB.prepare("INSERT INTO recon_run(run_ms,days,razorpay_seen,filed,unassigned,missing_in_razorpay,amount_mismatch,duplicate_paid) VALUES(?,?,?,?,?,?,?,?)")
    .bind(now, days, seen, filed, JSON.stringify(unassigned).slice(0, 4000), JSON.stringify(missing).slice(0, 4000), JSON.stringify(mismatch).slice(0, 4000), JSON.stringify(dup).slice(0, 4000)).run();
  return json({ ok: true, days, claims: Object.keys(claims).length, seen, filed, refunds, unassigned: unassigned.length, missing_in_razorpay: missing.length, amount_mismatch: mismatch.length, duplicate_paid: dup.length });
}
export const onRequest = () => new Response("Not found", { status: 404 });
