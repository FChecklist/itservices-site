// Central Razorpay webhook for every website paid through IT Services by Rajat Agarwal.
// 1) checks Razorpay's signature, 2) records the call (webhook_log) and the payment (payment) in the central ledger,
// 3) passes the untouched message on to the website the payment belongs to.
// The website still checks the signature itself, so nothing here can forge a payment. A ledger failure never stops the pass-on,
// and a failed pass-on answers 502 so Razorpay retries.
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
async function record(db, now, ev, signatureOk, outcome, site, fwd) {
  const pay = ev?.payload?.payment?.entity, ord = ev?.payload?.order?.entity;
  try {
    await db.prepare("INSERT INTO webhook_log(received_ms,event,rzp_event_id,rzp_order_id,rzp_payment_id,site,amount_minor,signature_ok,outcome,forward_status) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(now, ev?.event ?? null, ev?.id ?? null, pay?.order_id ?? ord?.id ?? null, pay?.id ?? null, site ?? null, pay?.amount ?? ord?.amount ?? null, signatureOk ? 1 : 0, outcome.slice(0, 200), fwd ?? null).run();
  } catch { /* the ledger is a record, not a gate */ }
}
async function upsertPayment(db, now, ev, site) {
  const p = ev?.payload?.payment?.entity; if (!p?.id) return;
  const n = p.notes && typeof p.notes === "object" ? p.notes : {};
  const status = p.status === "captured" || ev.event === "payment.captured" ? "paid" : p.status === "failed" ? "failed" : p.status || "created";
  const type = n.variation === "payment_test" ? "payment_test" : n.product_type ?? (n.variation ? "game_pack" : null);
  await db.prepare(`INSERT INTO payment(rzp_payment_id,rzp_order_id,site,product,product_type,product_ref,site_payment_ref,payer_user,payer_email,payer_phone,currency,amount_minor,method,status,is_international,notes,created_ms,captured_ms,updated_ms,stream,plan)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(rzp_payment_id) DO UPDATE SET status=CASE WHEN payment.status='paid' THEN 'paid' ELSE excluded.status END, method=excluded.method, stream=COALESCE(payment.stream,excluded.stream), plan=COALESCE(payment.plan,excluded.plan), captured_ms=COALESCE(payment.captured_ms,excluded.captured_ms), updated_ms=excluded.updated_ms`)
    .bind(p.id, p.order_id ?? null, site, n.product ?? null, type, n.variation ?? null, n.payment_ref ?? null, n.user ?? null, p.email ?? null, p.contact ?? null, p.currency ?? null, p.amount ?? null, p.method ?? null, status, p.international ? 1 : 0, JSON.stringify(n).slice(0, 1000), p.created_at ? p.created_at * 1000 : null, status === "paid" ? now : null, now, n.stream ?? "sales", n.plan ?? n.variation ?? null).run();
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
    if (db) await record(db, now, ev, false, env.RAZORPAY_WEBHOOK_SECRET ? "bad signature here" : "no secret configured here", site, null);
    return passOn(db, now, ev, false, site, raw, sig, "passed on unverified");
  }
  if (db) { try { await upsertPayment(db, now, ev, site); } catch (e) { await record(db, now, ev, true, "ledger error: " + String(e).slice(0, 120), site, null); } }
  return passOn(db, now, ev, true, site, raw, sig, "passed on");
}

async function passOn(db, now, ev, verified, site, raw, sig, label) {
  let target = null;
  if (db) { try { target = (await db.prepare("SELECT webhook_url FROM site WHERE host=? AND active=1").bind(site).first())?.webhook_url ?? null; } catch { /* none */ } }
  if (!target) { if (db && verified) await record(db, now, ev, true, "recorded; site has no webhook", site, null); return verified ? reply({ ok: true, recorded: true }, 200) : reply({ error: "bad signature" }, 400); }
  try {
    const r = await fetch(target, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig }, body: raw });
    if (db && verified) await record(db, now, ev, true, label, site, r.status);
    return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
  } catch {
    if (db && verified) await record(db, now, ev, true, "pass-on failed", site, 502);
    return reply({ error: "site unavailable" }, 502); // Razorpay retries a non-2xx answer
  }
}
