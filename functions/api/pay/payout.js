import { json, readJson, authSite, ownerOk, STREAMS_OUT, hex } from "../../_lib.js";
// Money OUT, recorded in the same Razorpay ledger:  stream = refer_and_earn | sales_team_commission | sales_team_salary.
// This service RECORDS payouts; it never moves money by itself. A payout becomes 'paid' only when the owner (Bearer LEDGER_KEY) records the real Razorpay payout id / bank reference.
//   POST /api/pay/payout   { action:"create", site, stream, plan, payee_ref, payee_name?, amount_minor, currency?, tds_minor?, period?, source_payment_id?, notes? }
//        a website (x-site-key) may create 'planned' payouts for its own site; the owner may create any.
//   POST /api/pay/payout   { action:"update", id, status:"approved"|"paid"|"failed"|"cancelled", rzp_payout_id?, utr?, method?, paid_ms? }   owner only
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b || !env.DB) return json({ error: "bad request" }, 400);
  const owner = ownerOk(request, env), now = Date.now();
  if (b.action === "update") {
    if (!owner) return json({ error: "not allowed" }, 404);
    const st = String(b.status ?? "");
    if (!["planned", "approved", "paid", "failed", "cancelled"].includes(st)) return json({ error: "bad status" }, 400);
    if (st === "paid" && !(b.rzp_payout_id || b.utr)) return json({ error: "a paid payout needs the Razorpay payout id or the bank reference (utr)" }, 400);
    const r = await env.DB.prepare("UPDATE payout SET status=?, rzp_payout_id=COALESCE(?,rzp_payout_id), utr=COALESCE(?,utr), method=COALESCE(?,method), paid_ms=CASE WHEN ?='paid' THEN COALESCE(?,?) ELSE paid_ms END, updated_ms=? WHERE id=?")
      .bind(st, b.rzp_payout_id ?? null, b.utr ?? null, b.method ?? null, st, Number(b.paid_ms) || null, now, now, String(b.id ?? "")).run();
    return (r.meta?.changes ?? 0) > 0 ? json({ ok: true }) : json({ error: "unknown payout" }, 404);
  }
  if (b.action !== "create") return json({ error: "bad action" }, 400);
  const site = owner ? { host: String(b.site ?? "") } : await authSite(request, env, b.site);
  if (!site || !site.host) return json({ error: "unknown site or wrong key" }, 401);
  if (!STREAMS_OUT.includes(b.stream)) return json({ error: "stream must be one of " + STREAMS_OUT.join(", ") }, 400);
  const amount = Number(b.amount_minor), tds = Number(b.tds_minor ?? 0);
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(tds) || tds < 0 || tds > amount) return json({ error: "bad amount or tds" }, 400);
  if (!b.payee_ref) return json({ error: "payee_ref is required" }, 400);
  const id = "po_" + hex(crypto.getRandomValues(new Uint8Array(8)));
  const status = owner && ["planned", "approved"].includes(b.status) ? b.status : "planned";
  await env.DB.prepare("INSERT INTO payout(id,site,stream,plan,payee_ref,payee_name,currency,amount_minor,tds_minor,period,source_payment_id,status,notes,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, site.host, b.stream, b.plan ? String(b.plan).slice(0, 60) : null, String(b.payee_ref).slice(0, 80), b.payee_name ? String(b.payee_name).slice(0, 120) : null, b.currency === "USD" ? "USD" : "INR", amount, tds, b.period ? String(b.period).slice(0, 20) : null, b.source_payment_id ? String(b.source_payment_id).slice(0, 60) : null, status, b.notes ? String(b.notes).slice(0, 300) : null, now, now).run();
  return json({ ok: true, id, status });
}
export const onRequest = () => new Response("Not found", { status: 404 });
