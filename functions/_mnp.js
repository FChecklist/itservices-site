// The push to Moneypenny (backup path for a closed browser tab): a captured payment for a Moneypenny credit order is told to Moneypenny,
// signed with the PURCHASE key that only this service holds, once per Razorpay payment id. Moneypenny credits the lot and pays the game in one step.
//   env.MNP_BASE_URL, env.MNP_KEY_ID, env.MNP_KEY_SECRET   (secrets; unset = nothing is sent, rows wait)
import { hmacHex, sha256, MNP_HOST } from "./_lib.js";
const MIN = 60_000, MAX_ATTEMPTS = 10;
const PATH = "/v1/game_pay/payment_confirmed";
const mnpReady = (env) => !!(env.MNP_BASE_URL && env.MNP_KEY_ID && env.MNP_KEY_SECRET);

/** Moneypenny's signing rule: HMAC-SHA256(secret, [timestamp, nonce, METHOD, pathWithQuery, sha256hex(body), idempotencyKey].join("\n")). */
export async function signedPost(env, path, bodyObj, idem, now = Date.now()) {
  const body = JSON.stringify(bodyObj), nonce = crypto.randomUUID();
  const sig = await hmacHex(env.MNP_KEY_SECRET, [String(now), nonce, "POST", path, await sha256(body), idem].join("\n"));
  return fetch(env.MNP_BASE_URL.replace(/\/$/, "") + path, { method: "POST", headers: { "content-type": "application/json", "x-mnp-key": env.MNP_KEY_ID, "x-mnp-timestamp": String(now), "x-mnp-nonce": nonce, "x-mnp-signature": sig, "idempotency-key": idem }, body });
}

/** Files the captured payment for delivery (once per payment id) and tries to deliver it now. Never throws: a failure only means "later". */
export async function queueCredit(env, db, paymentId, now = Date.now()) {
  try {
    const p = await db.prepare("SELECT rzp_payment_id, rzp_order_id, amount_minor, currency, status, site FROM payment WHERE rzp_payment_id=?").bind(paymentId).first();
    if (!p || p.site !== MNP_HOST || p.status !== "paid") return { queued: false };
    const o = await db.prepare("SELECT site_payment_ref, payer_email FROM pay_order WHERE rzp_order_id=? AND site=?").bind(p.rzp_order_id, MNP_HOST).first();
    if (!o || !o.payer_email) return { queued: false };
    await db.prepare("INSERT OR IGNORE INTO credit_outbox(rzp_payment_id,rzp_order_id,mp_order_id,payer_email,amount_minor,currency,status,attempts,next_ms,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(p.rzp_payment_id, p.rzp_order_id, o.site_payment_ref, o.payer_email, p.amount_minor, p.currency, "pending", 0, now, now).run();
    const d = await deliverCredit(env, db, paymentId, now);
    return { queued: true, sent: !!d.sent, dead: !!d.dead };
  } catch { return { queued: false, error: true }; }
}

/** One delivery attempt. 2xx = sent. 4xx = dead (a person must look: wrong payer, amount mismatch). Network or 5xx = tried again later with back-off. */
export async function deliverCredit(env, db, paymentId, now = Date.now()) {
  const r = await db.prepare("SELECT * FROM credit_outbox WHERE rzp_payment_id=? AND status='pending'").bind(paymentId).first();
  if (!r || !mnpReady(env)) return { sent: false };
  let status = 0, err = null;
  try {
    const res = await signedPost(env, PATH, { order_id: r.mp_order_id, payment_ref: r.rzp_payment_id, paid_minor: r.amount_minor, currency: r.currency, payer_email: r.payer_email }, `pay:${PATH}:${r.rzp_payment_id}`, now);
    status = res.status;
    if (status >= 400) { const t = await res.json().catch(() => ({})); err = String(t?.error?.code ?? status).slice(0, 80); }
  } catch { err = "unreachable"; }
  if (status >= 200 && status < 300) { await db.prepare("UPDATE credit_outbox SET status='sent', attempts=attempts+1, sent_ms=?, last_error=NULL WHERE rzp_payment_id=?").bind(now, paymentId).run(); return { sent: true }; }
  const attempts = r.attempts + 1;
  const dead = (status >= 400 && status < 500 && status !== 429 && status !== 408) || attempts >= MAX_ATTEMPTS;
  await db.prepare("UPDATE credit_outbox SET status=?, attempts=?, next_ms=?, last_error=? WHERE rzp_payment_id=?").bind(dead ? "dead" : "pending", attempts, now + Math.min(2 ** attempts, 60) * MIN, err, paymentId).run();
  return { sent: false, dead };
}

/** The scheduled run: files any captured Moneypenny payment that never reached the outbox (a missed webhook), then delivers what is due. */
export async function runCreditOutbox(env, db, now = Date.now(), limit = 25) {
  const missing = (await db.prepare("SELECT p.rzp_payment_id id FROM payment p WHERE p.site=? AND p.status='paid' AND NOT EXISTS (SELECT 1 FROM credit_outbox c WHERE c.rzp_payment_id=p.rzp_payment_id) LIMIT ?").bind(MNP_HOST, limit).all()).results ?? [];
  let queued = 0, sent = 0, dead = 0;
  for (const m of missing) { const q = await queueCredit(env, db, m.id, now); if (q.queued) queued++; if (q.sent) sent++; if (q.dead) dead++; }
  const due = (await db.prepare("SELECT rzp_payment_id id FROM credit_outbox WHERE status='pending' AND next_ms<=? ORDER BY next_ms LIMIT ?").bind(now, limit).all()).results ?? [];
  for (const d of due) { const r = await deliverCredit(env, db, d.id, now); if (r.sent) sent++; if (r.dead) dead++; }
  const stuck = (await db.prepare("SELECT COUNT(*) n FROM credit_outbox WHERE status='dead'").first())?.n ?? 0;
  return { queued, due: due.length, sent, dead, dead_total: stuck };
}
