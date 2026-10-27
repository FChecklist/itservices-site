import { signedIn, reply } from "../../_console.js";
import { FACTS } from "../../_facts.js";
// GET /api/console/data (signed-in owner only): everything the private console shows, in one answer.
//   sites     every website: name, live version (its /version.json), tests, paid orders and money from the central ledger
//   tambola   Corporate Tambola's own numbers (its /api/owner/stats, read with a key only this site holds)
//   payers    who paid (e-mail, mobile if the payment carried one), newest first; this is the only place a contact is shown
const timed = async (url, init = {}, ms = 4000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } };
export async function onRequestGet({ request, env }) {
  const now = Date.now();
  if (!(await signedIn(request, env, now))) return reply({ error: "Not found" }, 404);
  const db = env.DB;
  const sites = (await db.prepare("SELECT host, name, active FROM site ORDER BY host").all()).results ?? [];
  const money = (await db.prepare("SELECT site, SUM(status='paid' AND is_test=0) AS paid, SUM(status='failed') AS failed, SUM(CASE WHEN status='paid' AND is_test=0 THEN amount_minor ELSE 0 END) AS revenue_minor, MAX(captured_ms) AS last_ms FROM payment GROUP BY site").all().catch(() => ({ results: [] }))).results ?? [];
  const byHost = Object.fromEntries(money.map((m) => [m.site, m]));
  const live = async (host) => {
    const f = FACTS.sites[host]; if (!f?.url) return null;
    try {
      const r = await timed(f.url + "/version.json");
      if (r.ok) { const j = await r.json().catch(() => ({})); return { up: true, commit: j.commit ?? null, builtAt: j.builtAt ?? null, version: j.version ?? null }; }
      const home = await timed(f.url + "/"); // a site without a version file is up when its home page answers
      return home.ok ? { up: true, commit: null, builtAt: null, version: null } : { up: false, status: home.status };
    }
    catch { return { up: false, status: 0 }; }
  };
  const lives = await Promise.all(sites.map((s) => live(s.host)));
  const out = sites.map((s, i) => ({ host: s.host, name: FACTS.sites[s.host]?.name ?? s.name, url: FACTS.sites[s.host]?.url ?? null, active: !!s.active, live: lives[i], tests: FACTS.sites[s.host]?.tests ?? null,
    paidOrders: byHost[s.host]?.paid ?? 0, failedOrders: byHost[s.host]?.failed ?? 0, revenueMinor: byHost[s.host]?.revenue_minor ?? 0, lastPaid: byHost[s.host]?.last_ms ? new Date(byHost[s.host].last_ms).toISOString() : null }));
  let tambola = { error: "not connected" };
  if (env.OWNER_STATS_KEY) {
    try { const r = await timed(env.TAMBOLA_STATS_URL || "https://corporatetambola.com/api/owner/stats", { headers: { "x-owner-stats-key": env.OWNER_STATS_KEY } }, 8000); tambola = r.ok ? await r.json() : { error: "Tambola answered " + r.status }; }
    catch { tambola = { error: "Tambola did not answer" }; }
  }
  const payers = (await db.prepare("SELECT site, payer_email AS email, payer_phone AS phone, amount_minor, currency, captured_ms FROM payment WHERE status='paid' AND is_test=0 ORDER BY captured_ms DESC LIMIT 300").all().catch(() => ({ results: [] }))).results ?? [];
  return reply({ asOf: new Date(now).toISOString(), factsAsOf: FACTS.asOf, sites: out, tambola, payers: payers.map((p) => ({ site: p.site, email: p.email, phone: p.phone, amount: (p.amount_minor ?? 0) / 100, currency: p.currency, paid: p.captured_ms ? new Date(p.captured_ms).toISOString() : null })) });
}
export const onRequest = () => new Response("Not found", { status: 404 });
