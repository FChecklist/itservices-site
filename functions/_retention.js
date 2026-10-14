// What the central ledger (B) removes, and the job that does it. Written 14 Oct 2026 (data audit item 7). NOT SWITCHED ON: nothing calls it on a schedule, and even
// when called it only COUNTS (dry run) unless the request says apply=1 AND the secret RETENTION_LIVE is "1".
// RULE: billing data is never removed. Invoices, payments (paid, failed or started), refunds, disputes, settlements, payouts, expenses and the log of Razorpay messages
// are ledger records and are kept for audit and tax reasons: this job does not touch them, and the tests prove it.
// The ONLY thing removed is an order that was opened and never paid, after 30 days (stated in the Privacy Policy, build.py). An order with a payment row of any kind is kept.
export const RETENTION = { unpaid_order_days: 30 };
const DAY = 86400_000;
const WHERE = "status<>'paid' AND created_ms<? AND rzp_order_id NOT IN (SELECT rzp_order_id FROM payment WHERE rzp_order_id IS NOT NULL)";

/** Counts (dry run) or removes (apply) the unpaid orders past their period. Returns { unpaid_orders_deleted }. */
export async function runRetention(env, { apply = false, now = Date.now() } = {}) {
  const db = env.DB, cut = now - RETENTION.unpaid_order_days * DAY;
  if (!apply) return { unpaid_orders_deleted: (await db.prepare(`SELECT COUNT(*) AS n FROM pay_order WHERE ${WHERE}`).bind(cut).first())?.n ?? 0 };
  return { unpaid_orders_deleted: (await db.prepare(`DELETE FROM pay_order WHERE ${WHERE}`).bind(cut).run())?.meta?.changes ?? 0 };
}
