import { signedIn, reply } from "../../_console.js";
import { same, readJson } from "../../_lib.js";
import { CSV_KINDS, csv, journey, parseRange, summary } from "../../_analytics/report.ts";
import { ensureSchema, fullIpOn, setFullIp, sweep } from "../../_analytics/core.ts";
// GET  /api/console/visitors                         (signed-in owner, or the read-only key in header x-analytics-read-key): the numbers for every website, as JSON
//        ?site=<key>&from=YYYY-MM-DD&to=YYYY-MM-DD   one site or all, a date range (default: the last 30 days)
//        ?journey=<visitor id | ip_<hash> | s_<visit id>>   one visitor's whole path, across sites
//        ?csv=sessions|events|pages|daily            the same numbers as a spreadsheet file
// POST /api/console/visitors {fullIp: true|false}    (signed-in owner ONLY, never the read-only key): the switch for keeping full network addresses (OFF; erased after 30 days)
// The numbers live in the central database bound as ANALYTICS (D1 "site-analytics"); every site's own /api/t writes there. Names and mobile numbers are never in it.
const who = async (request, env, now, write) => {
  if (await signedIn(request, env, now)) return "owner";
  if (!write && env.ANALYTICS_READ_KEY && same(request.headers.get("x-analytics-read-key") ?? "", env.ANALYTICS_READ_KEY)) return "reader";
  return null;
};
const note = (db, who_, now) => db.prepare("INSERT INTO a_setting(k,v,at_ms) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at_ms=excluded.at_ms").bind("last_read_" + who_, "1", now).run().catch(() => {});
export async function onRequestGet({ request, env }) {
  const now = Date.now(), who_ = await who(request, env, now, false);
  if (!who_) return reply({ error: "Not found" }, 404);
  if (!env.ANALYTICS) return reply({ error: "The visitor database is not connected yet (binding ANALYTICS)." }, 503);
  const db = env.ANALYTICS, sp = new URL(request.url).searchParams;
  await ensureSchema(db);
  await note(db, who_, now);
  if (Math.random() < 0.02) await sweep(db, now).catch(() => {});
  if (sp.has("journey")) { const j = await journey(db, String(sp.get("journey")).trim()); return j ? reply(j) : reply({ error: "Not found" }, 404); }
  const { from, to } = parseRange(sp, now), site = sp.get("site") ?? "";
  if (sp.has("csv")) {
    const kind = sp.get("csv"); if (!CSV_KINDS.includes(kind)) return reply({ error: "Choose sessions, events, pages or daily." }, 400);
    const body = await csv(db, { kind, site, from, to });
    return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="visitors-${kind}-${new Date(now).toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  return reply({ ...(await summary(db, { site, from, to }, now)), reader: who_ });
}
export async function onRequestPost({ request, env }) {
  const now = Date.now();
  if ((await who(request, env, now, true)) !== "owner") return reply({ error: "Not found" }, 404);
  if (!env.ANALYTICS) return reply({ error: "The visitor database is not connected yet (binding ANALYTICS)." }, 503);
  const b = await readJson(request, 512);
  if (!b || typeof b.fullIp !== "boolean") return reply({ error: "Say fullIp true or false." }, 400);
  await setFullIp(env.ANALYTICS, b.fullIp, now);
  return reply({ ok: true, fullIp: await fullIpOn(env.ANALYTICS, now + 31_000) });
}
export const onRequest = () => new Response("Not found", { status: 404 });
