import { ownerOk } from "../../_lib.js";
// Owner-only reads of the central ledger, header  Authorization: Bearer <LEDGER_KEY>:
//   GET /api/pay/ledger?view=master   (default) every paid sale (in) and paid payout (out), one line each, with the ledger path
//   GET /api/pay/ledger?view=tax                totals per financial year / website / stream / plan (income tax)
//   GET /api/pay/ledger?view=payments|payouts|webhooks|refunds|expenses   the raw records
//   GET /api/pay/ledger?view=pnl            every line of money in and out with all its ids (payment, order, the website's own id)
//   GET /api/pay/ledger?view=pnl_summary    per financial year and website: revenue, gateway fee and tax, refunds, commission paid and accrued, other expenses, net
//   GET /api/pay/ledger?view=issues         anything that does not match (must be empty) ; view=recon  the last comparisons with Razorpay
// filters: site, stream, plan, financial_year, status, direction;  format=csv for a spreadsheet.
const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
const VIEWS = { master: ["master_ledger", "date_ms DESC", ["site", "stream", "plan", "financial_year", "direction", "status"]], tax: ["tax_summary", "financial_year DESC, site, stream", ["site", "stream", "plan", "financial_year", "direction"]], payments: ["payment_ledger", "created_utc DESC", ["site", "product", "product_type", "status"]], payouts: ["payout", "created_ms DESC", ["site", "stream", "plan", "status"]], webhooks: ["webhook_log", "id DESC", ["site"]], pnl: ["pnl_lines", "date_ms DESC", ["site", "line_type", "direction", "currency"]], pnl_summary: ["pnl_summary", "financial_year DESC, site", ["site", "financial_year", "currency"]], issues: ["ledger_issues", "issue, site", ["site", "issue"]], refunds: ["refund", "created_ms DESC", ["site", "status"]], expenses: ["expense", "incurred_ms DESC", ["site", "category"]], recon: ["recon_run", "id DESC", []] };
export async function onRequestGet({ request, env }) {
  if (!ownerOk(request, env)) return new Response("Not found", { status: 404 });
  const u = new URL(request.url), v = VIEWS[u.searchParams.get("view") ?? "master"];
  if (!v) return new Response("Unknown view", { status: 400 });
  const where = [], args = [];
  for (const f of v[2]) if (u.searchParams.get(f)) { where.push(f + "=?"); args.push(u.searchParams.get(f)); }
  const rows = (await env.DB.prepare(`SELECT * FROM ${v[0]}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY ${v[1]} LIMIT 2000`).bind(...args).all()).results ?? [];
  if (u.searchParams.get("format") === "csv") {
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    return new Response([cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n"), { headers: { "content-type": "text/csv", "cache-control": "no-store" } });
  }
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
export const onRequest = () => new Response("Not found", { status: 404 });
