import { json, readJson, authSite, rzpFetch, razorpayReady, hmacHex, same } from "../../_lib.js";
import { detailsOf } from "../../_central.js";
// POST /api/pay/verify   header x-site-key
// Body: { site, razorpay_order_id, razorpay_payment_id, razorpay_signature }.
// Checks Razorpay's checkout signature AND asks Razorpay what really happened (status, amount, order), captures an authorized payment,
// records the payment in the central ledger and tells the website the facts. Safe to call again for the same payment.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  if (!b) return json({ error: "bad request" }, 400);
  const site = await authSite(request, env, b.site);
  if (!site) return json({ error: "unknown site or wrong key" }, 401);
  if (!razorpayReady(env)) return json({ error: "payments are not configured" }, 503);
  const oid = String(b.razorpay_order_id ?? ""), pid = String(b.razorpay_payment_id ?? ""), sig = String(b.razorpay_signature ?? "");
  if (!/^order_\w+$/.test(oid) || !/^pay_\w+$/.test(pid)) return json({ error: "bad ids" }, 400);
  if (!same(await hmacHex(env.RAZORPAY_KEY_SECRET, `${oid}|${pid}`), sig)) return json({ error: "bad signature" }, 400);
  const order = await env.DB.prepare("SELECT * FROM pay_order WHERE rzp_order_id=? AND site=?").bind(oid, site.host).first();
  if (!order) return json({ error: "unknown order for this site" }, 404);
  let p;
  try { p = await rzpFetch(env, `/payments/${pid}`); } catch (e) { return json({ error: String(e.message ?? e).slice(0, 200) }, 502); }
  if (p.order_id !== oid || p.amount !== order.amount_minor || p.currency !== order.currency) return json({ error: "payment does not match the order" }, 409);
  if (p.status === "authorized") { try { p = await rzpFetch(env, `/payments/${pid}/capture`, { method: "POST", body: JSON.stringify({ amount: order.amount_minor, currency: order.currency }) }); } catch { /* re-read below */ } }
  const paid = p.status === "captured";
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO payment(rzp_payment_id,rzp_order_id,site,stream,plan,product,product_type,product_ref,site_payment_ref,payer_user,payer_email,payer_phone,currency,amount_minor,method,status,is_international,notes,created_ms,captured_ms,updated_ms,fee_minor,tax_minor,txn_id,bank,wallet,card_network,card_type,card_last4,card_issuer,vpa_masked,rrn,acquirer_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(rzp_payment_id) DO UPDATE SET status=CASE WHEN payment.status='paid' THEN 'paid' ELSE excluded.status END, method=excluded.method, stream=excluded.stream, plan=excluded.plan, captured_ms=COALESCE(payment.captured_ms,excluded.captured_ms), updated_ms=excluded.updated_ms, fee_minor=COALESCE(excluded.fee_minor,payment.fee_minor), tax_minor=COALESCE(excluded.tax_minor,payment.tax_minor), txn_id=COALESCE(payment.txn_id,excluded.txn_id), bank=COALESCE(excluded.bank,payment.bank), wallet=COALESCE(excluded.wallet,payment.wallet), card_network=COALESCE(excluded.card_network,payment.card_network), card_type=COALESCE(excluded.card_type,payment.card_type), card_last4=COALESCE(excluded.card_last4,payment.card_last4), card_issuer=COALESCE(excluded.card_issuer,payment.card_issuer), vpa_masked=COALESCE(excluded.vpa_masked,payment.vpa_masked), rrn=COALESCE(excluded.rrn,payment.rrn), acquirer_json=COALESCE(excluded.acquirer_json,payment.acquirer_json)`)
    .bind(pid, oid, site.host, order.stream, order.plan, order.product, order.plan === "payment_test" ? "payment_test" : "sale", order.plan, order.site_payment_ref, order.payer_user, p.email ?? order.payer_email, p.contact ?? order.payer_phone, order.currency, order.amount_minor, p.method ?? null, paid ? "paid" : String(p.status ?? "created"), p.international ? 1 : 0, JSON.stringify(p.notes ?? {}).slice(0, 1000), p.created_at ? p.created_at * 1000 : order.created_ms, paid ? now : null, now, p.fee ?? null, p.tax ?? null, order.txn_id ?? null, ...detailsOf(p)).run();
  if (paid) await env.DB.prepare("UPDATE pay_order SET status='paid', paid_ms=COALESCE(paid_ms,?) WHERE rzp_order_id=?").bind(now, oid).run();
  return json({ ok: true, txn_id: order.txn_id ?? null, fee_minor: p.fee ?? null, tax_minor: p.tax ?? null, paid, status: p.status, amount_minor: order.amount_minor, currency: order.currency, method: p.method ?? null, payer_email: p.email ?? null, payer_phone: p.contact ?? null, stream: order.stream, product: order.product, plan: order.plan, payment_ref: order.site_payment_ref, razorpay_payment_id: pid, razorpay_order_id: oid, razorpay: { method: p.method ?? null, vpa: p.vpa ?? null, bank: p.bank ?? null, wallet: p.wallet ?? null, card_last4: p.card?.last4 ?? null, card_network: p.card?.network ?? null, bank_transaction_id: p.acquirer_data?.bank_transaction_id ?? p.acquirer_data?.rrn ?? null, created_at_ms: p.created_at ? p.created_at * 1000 : null } });
}
export const onRequest = () => new Response("Not found", { status: 404 });
