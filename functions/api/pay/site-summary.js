import { json, readJson, authSite } from "../../_lib.js";
// POST /api/pay/site-summary   header x-site-key   (ledger C -> ledger B)
// A website reports the totals of its OWN payment ledger for one month: { site, period_key: "YYYY-MM", currency?, paid_count, failed_count, revenue_minor, fee_minor?, tax_minor?, refunded_minor?, commission_accrued_minor?, commission_paid_minor? }.
// The owner report compares these with the central ledger. Sending the same month again replaces it.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b || !env.DB) return json({ error: "bad request" }, 400);
  const site = await authSite(request, env, b.site);
  if (!site) return json({ error: "unknown site or wrong key" }, 401);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.period_key ?? ""))) return json({ error: "period_key must be YYYY-MM" }, 400);
  const n = (v) => { const x = Number(v ?? 0); return Number.isInteger(x) && x >= 0 && x < 1e13 ? x : null; };
  const f = { paid_count: n(b.paid_count), failed_count: n(b.failed_count), revenue_minor: n(b.revenue_minor), fee_minor: n(b.fee_minor), tax_minor: n(b.tax_minor), refunded_minor: n(b.refunded_minor), commission_accrued_minor: n(b.commission_accrued_minor), commission_paid_minor: n(b.commission_paid_minor) };
  if (Object.values(f).some((v) => v === null)) return json({ error: "bad number" }, 400);
  const cur = b.currency === "USD" ? "USD" : "INR";
  await env.DB.prepare(`INSERT INTO site_summary(site,period_key,currency,paid_count,failed_count,revenue_minor,fee_minor,tax_minor,refunded_minor,commission_accrued_minor,commission_paid_minor,reported_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(site,period_key,currency) DO UPDATE SET paid_count=excluded.paid_count, failed_count=excluded.failed_count, revenue_minor=excluded.revenue_minor, fee_minor=excluded.fee_minor, tax_minor=excluded.tax_minor, refunded_minor=excluded.refunded_minor, commission_accrued_minor=excluded.commission_accrued_minor, commission_paid_minor=excluded.commission_paid_minor, reported_ms=excluded.reported_ms`)
    .bind(site.host, b.period_key, cur, f.paid_count, f.failed_count, f.revenue_minor, f.fee_minor, f.tax_minor, f.refunded_minor, f.commission_accrued_minor, f.commission_paid_minor, Date.now()).run();
  return json({ ok: true });
}
export const onRequest = () => new Response("Not found", { status: 404 });
