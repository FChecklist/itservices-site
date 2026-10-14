// The receipt e-mail of a payment test made on the central page /paytest/. Sent ONCE per payment, whichever of the three paths reaches the paid payment first
// (the buyer's own confirmation, Razorpay's webhook, or the 30-minute comparison with Razorpay): the first one to write receipt_ms owns the send.
// A mail that could not be sent gives the claim back, so the next path tries again. Tests of the games are not mailed from here: each game sends its own.
import { ITS_HOST } from "./_lib.js";

const IST = 19800_000;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stamp = (ms) => new Date(ms + IST).toISOString().replace("T", " ").slice(0, 16) + " IST";
const SELLER = "IT Services by Rajat Agarwal";
const CONTACT = "rajatsiroffice@gmail.com";

/** The receipt text and html for one test payment row. */
export function receiptOf(row) {
  const name = String(row.payer_user || "").trim(), when = stamp(row.captured_ms ?? Date.now()), rs = "Rs " + (Number(row.amount_minor || 0) / 100).toFixed(2).replace(/\.00$/, "");
  const lines = [`Hello${name ? " " + name : ""},`, "", `Thank you. Your payment test of ${rs} worked. Nothing was bought and nothing else will happen.`, "",
    `Receipt number: ${row.txn_id}`, `Razorpay payment: ${row.rzp_payment_id}`, `Date: ${when}`, `Amount: ${rs} (no GST is charged)`, `Paid to: ${SELLER}`, "",
    "A payment test is not refunded.", `Questions: ${CONTACT}`];
  const text = lines.join("\n");
  const html = `<div style="font:15px/1.5 Arial,sans-serif;color:#1F2A37;max-width:520px"><h2 style="margin:0 0 8px;color:#0E7C6E">Payment test received</h2>
<p>Hello${name ? " " + esc(name) : ""},</p><p>Thank you. Your payment test of <b>${esc(rs)}</b> worked. Nothing was bought and nothing else will happen.</p>
<table cellpadding="6" style="border-collapse:collapse;font:14px Arial,sans-serif"><tr><td>Receipt number</td><td><b>${esc(row.txn_id)}</b></td></tr><tr><td>Razorpay payment</td><td>${esc(row.rzp_payment_id)}</td></tr><tr><td>Date</td><td>${esc(when)}</td></tr><tr><td>Amount</td><td>${esc(rs)} (no GST is charged)</td></tr><tr><td>Paid to</td><td>${esc(SELLER)}</td></tr></table>
<p>A payment test is not refunded.</p><p style="color:#43566B">Questions: <a href="mailto:${CONTACT}">${CONTACT}</a></p></div>`;
  return { subject: `Payment test received: receipt ${row.txn_id}`, text, html };
}

/** Sends the receipt of one PAID central payment test, once. Answers "sent", "already", "skipped", "no mail key" or "failed". Never throws. */
export async function sendTestReceipt(env, db, rzpPaymentId, now = Date.now()) {
  try {
    const row = await db.prepare("SELECT rzp_payment_id, txn_id, payer_user, payer_email, amount_minor, captured_ms FROM payment WHERE rzp_payment_id=? AND is_test=1 AND site=? AND status='paid'").bind(String(rzpPaymentId), ITS_HOST).first();
    if (!row || !row.payer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.payer_email)) return "skipped";
    if (!env.RESEND_API_KEY) return "no mail key";
    const claim = await db.prepare("UPDATE payment SET receipt_ms=? WHERE rzp_payment_id=? AND receipt_ms IS NULL").bind(now, row.rzp_payment_id).run();
    if (!(claim?.meta?.changes > 0)) return "already";
    const m = receiptOf(row);
    let ok = false;
    try {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.MAIL_FROM ?? `${SELLER} <onboarding@resend.dev>`, to: [row.payer_email], subject: m.subject, text: m.text, html: m.html, headers: { "Auto-Submitted": "auto-generated" } }) });
      ok = r.ok;
    } catch { ok = false; }
    if (!ok) { await db.prepare("UPDATE payment SET receipt_ms=NULL WHERE rzp_payment_id=?").bind(row.rzp_payment_id).run(); return "failed"; }
    return "sent";
  } catch { return "failed"; }
}
