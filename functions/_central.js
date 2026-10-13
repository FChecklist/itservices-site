// Central Razorpay webhook for every website paid through IT Services by Rajat Agarwal.
// 1) checks Razorpay's signature, 2) records the call (webhook_log) and the payment (payment) in the central ledger,
// 3) passes the untouched message on to the website the payment belongs to.
// The website still checks the signature itself, so nothing here can forge a payment. A ledger failure never stops the pass-on,
// and a failed pass-on answers 502 so Razorpay retries.
import { SITE_CODES } from "./_lib.js";
const enc = new TextEncoder();
const hex = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
async function hmacHex(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, data));
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const reply = (o, status) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function siteFor(db, notes, defaultSite) {
  if (notes.site) return String(notes.site);
  if (notes.product) { const r = await db.prepare("SELECT site FROM product_catalog WHERE product=? LIMIT 1").bind(String(notes.product)).first(); if (r) return r.site; }
  return defaultSite;
}
async function record(db, now, ev, signatureOk, outcome, site, fwd, raw, sig) {
  const pay = ev?.payload?.payment?.entity, ord = ev?.payload?.order?.entity;
  try {
    await db.prepare("INSERT INTO webhook_log(received_ms,event,rzp_event_id,rzp_order_id,rzp_payment_id,site,amount_minor,signature_ok,outcome,forward_status,raw_body,raw_sig) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(now, ev?.event ?? null, ev?.id ?? null, pay?.order_id ?? ord?.id ?? null, pay?.id ?? null, site ?? null, pay?.amount ?? ord?.amount ?? null, signatureOk ? 1 : 0, outcome.slice(0, 200), fwd ?? null, signatureOk ? null : (raw ?? null), signatureOk ? null : (sig ?? null)).run();
  } catch { /* the ledger is a record, not a gate */ }
}
const mask = (v) => { const s = String(v ?? ""); const i = s.indexOf("@"); return i > 0 ? s.slice(0, Math.min(2, i)) + "***" + s.slice(i) : (s ? s.slice(0, 2) + "***" : null); };
/** The instrument and bank-reference details of one Razorpay payment, in the order: bank, wallet, card_network, card_type, card_last4, card_issuer, vpa_masked, rrn, acquirer_json. The UPI id is kept masked; no full card number is ever present. */
export function detailsOf(p) {
  const a = p?.acquirer_data && typeof p.acquirer_data === "object" && !Array.isArray(p.acquirer_data) ? p.acquirer_data : null;
  return [p?.bank ?? null, p?.wallet ?? null, p?.card?.network ?? null, p?.card?.type ?? null, p?.card?.last4 != null ? String(p.card.last4).slice(-4) : null, p?.card?.issuer ?? null, p?.vpa ? mask(p.vpa) : null, a?.rrn ?? null, a ? JSON.stringify(a).slice(0, 500) : null];
}
export async function upsertPayment(db, now, ev, site, eventMs) {
  const p = ev?.payload?.payment?.entity; if (!p?.id) return;
  const n = p.notes && typeof p.notes === "object" ? p.notes : {};
  const status = p.status === "captured" || ev.event === "payment.captured" ? "paid" : p.status === "failed" || ev.event === "payment.failed" ? "failed" : p.status || "created";
  const type = n.variation === "payment_test" ? "payment_test" : n.product_type ?? (n.variation ? "game_pack" : null);
  const fee = Number.isFinite(Number(p.fee)) && p.fee != null ? Number(p.fee) : null, tax = Number.isFinite(Number(p.tax)) && p.tax != null ? Number(p.tax) : null;
  const when = eventMs ?? now, ref = n.payment_ref ?? null, txn = n.txn_id ?? (SITE_CODES[site] && ref ? `${SITE_CODES[site]}-${ref}` : null);
  await db.prepare(`INSERT INTO payment(rzp_payment_id,rzp_order_id,site,product,product_type,product_ref,site_payment_ref,payer_user,payer_email,payer_phone,currency,amount_minor,method,status,is_international,notes,created_ms,captured_ms,updated_ms,stream,plan,fee_minor,tax_minor,refunded_minor,reconciled_ms,txn_id,authorized_ms,failed_ms,bank,wallet,card_network,card_type,card_last4,card_issuer,vpa_masked,rrn,acquirer_json,error_code,error_description,error_source,error_step,error_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(rzp_payment_id) DO UPDATE SET status=CASE WHEN payment.status='paid' THEN 'paid' ELSE excluded.status END, method=COALESCE(excluded.method,payment.method), stream=COALESCE(payment.stream,excluded.stream), plan=COALESCE(payment.plan,excluded.plan), captured_ms=COALESCE(payment.captured_ms,excluded.captured_ms), updated_ms=excluded.updated_ms,
      fee_minor=COALESCE(excluded.fee_minor,payment.fee_minor), tax_minor=COALESCE(excluded.tax_minor,payment.tax_minor), refunded_minor=MAX(payment.refunded_minor,excluded.refunded_minor), reconciled_ms=CASE WHEN excluded.fee_minor IS NOT NULL THEN excluded.reconciled_ms ELSE payment.reconciled_ms END,
      txn_id=COALESCE(payment.txn_id,excluded.txn_id), authorized_ms=COALESCE(payment.authorized_ms,excluded.authorized_ms), failed_ms=COALESCE(payment.failed_ms,excluded.failed_ms), bank=COALESCE(excluded.bank,payment.bank), wallet=COALESCE(excluded.wallet,payment.wallet), card_network=COALESCE(excluded.card_network,payment.card_network), card_type=COALESCE(excluded.card_type,payment.card_type), card_last4=COALESCE(excluded.card_last4,payment.card_last4), card_issuer=COALESCE(excluded.card_issuer,payment.card_issuer), vpa_masked=COALESCE(excluded.vpa_masked,payment.vpa_masked), rrn=COALESCE(excluded.rrn,payment.rrn), acquirer_json=COALESCE(excluded.acquirer_json,payment.acquirer_json),
      error_code=COALESCE(excluded.error_code,payment.error_code), error_description=COALESCE(excluded.error_description,payment.error_description), error_source=COALESCE(excluded.error_source,payment.error_source), error_step=COALESCE(excluded.error_step,payment.error_step), error_reason=COALESCE(excluded.error_reason,payment.error_reason)`)
    .bind(p.id, p.order_id ?? null, site, n.product ?? null, type, n.variation ?? null, ref, n.user ?? null, p.email ?? null, p.contact ?? null, p.currency ?? null, p.amount ?? null, p.method ?? null, status, p.international ? 1 : 0, JSON.stringify(n).slice(0, 1000), p.created_at ? p.created_at * 1000 : null, status === "paid" ? when : null, now, n.stream ?? "sales", n.variation ?? n.plan ?? null, fee, tax, Number(p.amount_refunded ?? 0) || 0, fee != null ? now : null,
      txn, ev.event === "payment.authorized" || p.status === "authorized" ? when : null, status === "failed" ? when : null, ...detailsOf(p), p.error_code ?? null, p.error_description ?? null, p.error_source ?? null, p.error_step ?? null, p.error_reason ?? null).run();
}
/** One Razorpay dispute (disp_...): the same dispute seen twice is one row, its status moves forward. */
export async function upsertDispute(db, d, site) {
  if (!d?.id || !d.payment_id) return;
  await db.prepare(`INSERT INTO dispute(rzp_dispute_id,rzp_payment_id,site,currency,amount_minor,amount_deducted_minor,reason_code,reason_description,phase,status,respond_by_ms,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(rzp_dispute_id) DO UPDATE SET status=excluded.status, phase=excluded.phase, amount_deducted_minor=excluded.amount_deducted_minor, updated_ms=excluded.updated_ms`)
    .bind(d.id, d.payment_id, site ?? null, d.currency ?? null, Number(d.amount) || 0, Number(d.amount_deducted) || 0, d.reason_code ?? null, d.reason_description ?? null, d.phase ?? null, d.status ?? null, d.respond_by ? d.respond_by * 1000 : null, d.created_at ? d.created_at * 1000 : Date.now(), Date.now()).run();
}
/** One Razorpay settlement (setl_...) with its bank reference (UTR). */
export async function upsertSettlement(db, s) {
  if (!s?.id) return;
  await db.prepare(`INSERT INTO settlement(settlement_id,utr,currency,amount_minor,fees_minor,tax_minor,status,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(settlement_id) DO UPDATE SET utr=COALESCE(excluded.utr,settlement.utr), amount_minor=excluded.amount_minor, fees_minor=excluded.fees_minor, tax_minor=excluded.tax_minor, status=excluded.status, updated_ms=excluded.updated_ms`)
    .bind(s.id, s.utr ?? null, "INR", Number(s.amount) || null, Number(s.fees) || null, Number(s.tax) || null, s.status ?? null, s.created_at ? s.created_at * 1000 : Date.now(), Date.now()).run();
}
/** One Razorpay refund (rfnd_...). The same refund seen twice is one row. */
export async function upsertRefund(db, r, site) {
  if (!r?.id || !r.payment_id) return;
  await db.prepare(`INSERT INTO refund(rzp_refund_id,rzp_payment_id,site,currency,amount_minor,status,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(rzp_refund_id) DO UPDATE SET status=excluded.status, updated_ms=excluded.updated_ms`)
    .bind(r.id, r.payment_id, site ?? null, r.currency ?? null, Number(r.amount) || 0, r.status ?? null, r.created_at ? r.created_at * 1000 : Date.now(), Date.now()).run();
  await db.prepare("UPDATE payment SET refunded_minor=MAX(refunded_minor,(SELECT COALESCE(SUM(amount_minor),0) FROM refund WHERE rzp_payment_id=?)) WHERE rzp_payment_id=?").bind(r.payment_id, r.payment_id).run();
}

export async function handleRazorpayWebhook(request, env, defaultSite) {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 100_000) return reply({ error: "too large" }, 413);
  const sig = request.headers.get("x-razorpay-signature");
  if (!sig) return reply({ error: "missing signature" }, 400);
  const db = env.DB, now = Date.now();
  let ev = null; try { ev = JSON.parse(new TextDecoder().decode(raw)); } catch { /* logged below */ }
  const ok = !!env.RAZORPAY_WEBHOOK_SECRET && same(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), sig);
  const notes = ev?.payload?.payment?.entity?.notes ?? ev?.payload?.order?.entity?.notes ?? {};
  let site = defaultSite;
  if (db) { try { site = await siteFor(db, notes, defaultSite); } catch { /* default */ } }
  if (!ok) {
    // not our secret (or none set): still hand it to the site, which checks with its own secret; record that it did not pass here
    if (db) await record(db, now, ev, false, env.RAZORPAY_WEBHOOK_SECRET ? "bad signature here" : "no secret configured here", site, null, new TextDecoder().decode(raw).slice(0, 6000), sig);
    return passOn(db, now, ev, false, site, raw, sig, "passed on unverified", request.headers.get("x-razorpay-event-id"));
  }
  const evId = request.headers.get("x-razorpay-event-id");
  if (db && evId) { try { if (await db.prepare("SELECT 1 FROM event_seen WHERE rzp_event_id=?").bind(evId).first()) return reply({ ok: true, duplicate: evId }, 200); } catch { /* process it */ } }
  if (db) { try { await upsertPayment(db, now, ev, site, ev?.created_at ? ev.created_at * 1000 : now); const rf = ev?.payload?.refund?.entity; if (rf) await upsertRefund(db, rf, site); const dp = ev?.payload?.dispute?.entity; if (dp) await upsertDispute(db, dp, site); const st = ev?.payload?.settlement?.entity; if (st) await upsertSettlement(db, st); } catch (e) { await record(db, now, ev, true, "ledger error: " + String(e).slice(0, 120), site, null); } }
  return passOn(db, now, ev, true, site, raw, sig, "passed on", evId);
}

async function passOn(db, now, ev, verified, site, raw, sig, label, evHeader) {
  let target = null;
  if (db) { try { target = (await db.prepare("SELECT webhook_url FROM site WHERE host=? AND active=1").bind(site).first())?.webhook_url ?? null; } catch { /* none */ } }
  if (!target) { if (db && verified) await record(db, now, ev, true, "recorded; site has no webhook", site, null); return verified ? reply({ ok: true, recorded: true }, 200) : reply({ error: "bad signature" }, 400); }
  try {
    const r = await fetch(target, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig, ...(evHeader ? { "x-razorpay-event-id": evHeader } : {}) }, body: raw });
    if (db && verified) await record(db, now, ev, true, label, site, r.status);
    return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
  } catch {
    if (db && verified) await record(db, now, ev, true, "pass-on failed", site, 502);
    return reply({ error: "site unavailable" }, 502); // Razorpay retries a non-2xx answer
  }
}
