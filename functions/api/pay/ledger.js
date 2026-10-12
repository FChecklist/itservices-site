// Owner-only read of the central ledger: GET /api/pay/ledger?site=&product=&product_type=&status=&format=csv  with  Authorization: Bearer <LEDGER_KEY>.
const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
export async function onRequestGet({ request, env }) {
  const auth = request.headers.get("authorization") ?? "";
  if (!env.LEDGER_KEY || auth !== "Bearer " + env.LEDGER_KEY) return new Response("Not found", { status: 404 });
  const u = new URL(request.url), where = [], args = [];
  for (const f of ["site", "product", "product_type", "status"]) if (u.searchParams.get(f)) { where.push(f + "=?"); args.push(u.searchParams.get(f)); }
  const rows = (await env.DB.prepare("SELECT * FROM payment_ledger" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY created_utc DESC LIMIT 500").bind(...args).all()).results ?? [];
  if (u.searchParams.get("format") === "csv") {
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    return new Response([cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n"), { headers: { "content-type": "text/csv", "cache-control": "no-store" } });
  }
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
export const onRequest = () => new Response("Not found", { status: 404 });
