import { json, readJson, ownerOk, hex } from "../../_lib.js";
// POST /api/pay/expense   Authorization: Bearer <LEDGER_KEY>   (owner only)
// An expense of IT Services by Rajat Agarwal that is not a Razorpay fee (those come by themselves from each payment): { category, description, amount_minor, tax_minor?, currency?, incurred_date "YYYY-MM-DD", site? (the website it belongs to), doc_ref (bill / invoice number), rzp_payment_id? }
// The same bill is never entered twice: (source "manual", doc_ref) is unique, so sending it again answers "already recorded".
const CATEGORIES = ["hosting", "domain", "software", "legal", "marketing", "bank", "tds_deposited", "salary", "other"];
export async function onRequestPost({ request, env }) {
  if (!ownerOk(request, env)) return new Response("Not found", { status: 404 });
  const b = await readJson(request);
  if (!b || !env.DB) return json({ error: "bad request" }, 400);
  if (!CATEGORIES.includes(b.category)) return json({ error: "category must be one of " + CATEGORIES.join(", ") }, 400);
  const amount = Number(b.amount_minor), tax = Number(b.tax_minor ?? 0), when = Date.parse(String(b.incurred_date ?? "") + "T00:00:00+05:30");
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(tax) || tax < 0 || !Number.isFinite(when)) return json({ error: "bad amount or date" }, 400);
  if (!b.description || !b.doc_ref) return json({ error: "description and doc_ref (the bill or invoice number) are required" }, 400);
  if (b.site) { const s = await env.DB.prepare("SELECT host FROM site WHERE host=?").bind(String(b.site)).first(); if (!s) return json({ error: "unknown site" }, 400); }
  const id = "ex_" + hex(crypto.getRandomValues(new Uint8Array(8)));
  try {
    await env.DB.prepare("INSERT INTO expense(id,site,category,description,currency,amount_minor,tax_minor,incurred_ms,source,source_ref,rzp_payment_id,doc_ref,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, b.site ? String(b.site) : null, b.category, String(b.description).slice(0, 200), b.currency === "USD" ? "USD" : "INR", amount, tax, when, "manual", String(b.doc_ref).slice(0, 80), b.rzp_payment_id ? String(b.rzp_payment_id).slice(0, 60) : null, String(b.doc_ref).slice(0, 80), Date.now()).run();
  } catch (e) { if (/UNIQUE/i.test(String(e))) return json({ ok: true, already_recorded: true }); throw e; }
  return json({ ok: true, id });
}
export const onRequest = () => new Response("Not found", { status: 404 });
