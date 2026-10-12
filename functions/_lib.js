// Shared helpers for the central payment service (IT Services by Rajat Agarwal).
export const STREAMS_OUT = ["refer_and_earn", "sales_team_commission", "sales_team_salary"];
const enc = new TextEncoder();
export const hex = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export async function hmacHex(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, typeof data === "string" ? enc.encode(data) : data));
}
export const same = (a, b) => { a = String(a ?? ""); b = String(b ?? ""); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export async function readJson(request, max = 8192) { const t = await request.text(); if (t.length > max) return null; try { const v = JSON.parse(t); return v && typeof v === "object" ? v : null; } catch { return null; } }
const RZP = (env) => env.RAZORPAY_BASE_URL || "https://api.razorpay.com/v1";
const basic = (env) => "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
export const razorpayReady = (env) => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export async function rzpFetch(env, path, init = {}) {
  const r = await fetch(RZP(env) + path, { ...init, headers: { authorization: basic(env), "content-type": "application/json", ...(init.headers ?? {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.description ?? `Razorpay refused the request (${r.status})`);
  return data;
}
/** The calling website, proven by its secret key (sha256 kept in site.key_hash). Returns the site row or null. */
export async function authSite(request, env, siteHost) {
  const key = request.headers.get("x-site-key") ?? "";
  if (!key || !siteHost || !env.DB) return null;
  const row = await env.DB.prepare("SELECT host, name, active, key_hash FROM site WHERE host=?").bind(String(siteHost)).first();
  if (!row || !row.active || !row.key_hash) return null;
  return same(await sha256(key), row.key_hash) ? row : null;
}
export const ownerOk = (request, env) => !!env.LEDGER_KEY && same(request.headers.get("authorization") ?? "", "Bearer " + env.LEDGER_KEY);
