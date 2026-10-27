import { signedIn, reply } from "../../_console.js";
import { readJson } from "../../_lib.js";
// GET|POST /api/console/links (signed-in owner only): one-time Rs 0 prospect links, made and switched on Corporate Tambola with a key only this site holds (OWNER_LINK_KEY).
// Today this covers Corporate Tambola; another game is one more entry in GAMES once that game has the same /api/owner/prospect-links address.
const GAMES = { "corporate-tambola": { name: "Corporate Tambola", url: "https://corporatetambola.com" } };
const timed = async (url, init = {}, ms = 8000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } };
async function ask(env, game, method, body) {
  const g = GAMES[game]; if (!g || !env.OWNER_LINK_KEY) return { status: 503, body: { error: "This game is not connected yet." } };
  try {
    const r = await timed(g.url + "/api/owner/prospect-links", { method, headers: { "x-owner-link-key": env.OWNER_LINK_KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status === 404 ? 502 : r.status, body: await r.json().catch(() => ({ error: "No answer." })) };
  } catch { return { status: 502, body: { error: g.name + " did not answer. Try again." } }; }
}
export async function onRequestGet({ request, env }) {
  if (!(await signedIn(request, env, Date.now()))) return reply({ error: "Not found" }, 404);
  const out = [];
  for (const game of Object.keys(GAMES)) { const r = await ask(env, game, "GET"); out.push({ game, name: GAMES[game].name, error: r.status === 200 ? null : r.body.error ?? "Could not load.", links: r.status === 200 ? r.body.links : [] }); }
  return reply({ games: out });
}
export async function onRequestPost({ request, env }) {
  if (!(await signedIn(request, env, Date.now()))) return reply({ error: "Not found" }, 404);
  const b = await readJson(request, 2048);
  if (!b || !GAMES[b.game] || !["create", "enable", "disable", "apply", "free"].includes(b.action)) return reply({ error: "Choose a game and an action." }, 400);
  const send = { action: b.action };
  if (b.action === "create") { send.label = String(b.label ?? "").slice(0, 60); send.cap = Number(b.cap) || 100; send.days = Number(b.days) || 7; } else if (b.action === "apply" || b.action === "free") { send.eid = String(b.eid ?? "").slice(0, 40); if (b.action === "free") send.reason = String(b.reason ?? "").slice(0, 80); } else send.id = String(b.id ?? "").slice(0, 10);
  const r = await ask(env, b.game, "POST", send);
  return reply(r.body, r.status);
}
export const onRequest = () => new Response("Not found", { status: 404 });
