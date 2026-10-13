import { json, readJson, authSite, hex } from "../../_lib.js";
// POST /api/pay/commission   header x-site-key   (ledger C -> ledger B)
// A website tells the central ledger about ONE commission row of its own: { site, site_ref, rzp_payment_id | payment_ref, partner_code, partner_name?, amount_minor, currency?, status: "accrued"|"void"|"paid", paid_ref? }
//   site_ref     the website's own commission id (C: commission.id). One site_ref is one payout row, forever: sending it again updates it, never adds a second.
//   the sale     named by rzp_payment_id, or by payment_ref (the website's own payment id); it must already be a PAID sale of the same website in this ledger.
// accrued -> payout "planned" (never lowers an "approved"/"paid" one); void -> "cancelled" (never a paid one); paid needs paid_ref (the bank / Razorpay payout reference).
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b || !env.DB) return json({ error: "bad request" }, 400);
  const site = await authSite(request, env, b.site);
  if (!site) return json({ error: "unknown site or wrong key" }, 401);
  const siteRef = String(b.site_ref ?? "").slice(0, 80);
  if (!siteRef) return json({ error: "site_ref is required" }, 400);
  const st = String(b.status ?? "accrued");
  if (!["accrued", "void", "paid"].includes(st)) return json({ error: "bad status" }, 400);
  const amount = Number(b.amount_minor);
  if (!Number.isInteger(amount) || amount <= 0) return json({ error: "bad amount" }, 400);
  if (st === "paid" && !b.paid_ref) return json({ error: "a paid commission needs paid_ref" }, 400);
  const sale = b.rzp_payment_id
    ? await env.DB.prepare("SELECT rzp_payment_id, status FROM payment WHERE rzp_payment_id=? AND site=?").bind(String(b.rzp_payment_id), site.host).first()
    : await env.DB.prepare("SELECT rzp_payment_id, status FROM payment WHERE site=? AND site_payment_ref=? AND status='paid' ORDER BY captured_ms DESC LIMIT 1").bind(site.host, String(b.payment_ref ?? "")).first();
  if (!sale || sale.status !== "paid") return json({ error: "the sale is not a paid sale in the central ledger yet; send this again later" }, 409);
  const now = Date.now(), have = await env.DB.prepare("SELECT id, status, source_payment_id FROM payout WHERE site=? AND site_ref=?").bind(site.host, siteRef).first();
  if (have) {
    if (have.source_payment_id && have.source_payment_id !== sale.rzp_payment_id) return json({ error: "this commission id is already linked to a different sale" }, 409);
    let next = have.status;
    if (st === "void" && have.status !== "paid") next = "cancelled";
    else if (st === "paid") next = "paid";
    else if (st === "accrued" && have.status === "cancelled") next = "planned";
    await env.DB.prepare("UPDATE payout SET status=?, utr=CASE WHEN ?='paid' THEN COALESCE(?,utr) ELSE utr END, paid_ms=CASE WHEN ?='paid' THEN COALESCE(paid_ms,?) ELSE paid_ms END, amount_minor=CASE WHEN status IN ('planned','approved') THEN ? ELSE amount_minor END, updated_ms=? WHERE id=?")
      .bind(next, next, b.paid_ref ? String(b.paid_ref).slice(0, 80) : null, next, now, amount, now, have.id).run();
    return json({ ok: true, id: have.id, status: next, updated: true });
  }
  if (st === "void") return json({ ok: true, ignored: "void of an unknown commission" });
  const id = "po_" + hex(crypto.getRandomValues(new Uint8Array(8))), status = st === "paid" ? "paid" : "planned";
  await env.DB.prepare("INSERT INTO payout(id,site,stream,plan,payee_ref,payee_name,currency,amount_minor,tds_minor,period,source_payment_id,status,utr,paid_ms,site_ref,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, site.host, "refer_and_earn", "partner", String(b.partner_code ?? "").slice(0, 80) || "unknown", b.partner_name ? String(b.partner_name).slice(0, 120) : null, b.currency === "USD" ? "USD" : "INR", amount, 0, null, sale.rzp_payment_id, status, status === "paid" ? String(b.paid_ref).slice(0, 80) : null, status === "paid" ? now : null, siteRef, now, now).run();
  return json({ ok: true, id, status, updated: false });
}
export const onRequest = () => new Response("Not found", { status: 404 });
