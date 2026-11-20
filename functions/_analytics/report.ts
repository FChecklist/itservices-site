// Owner reports over the central visitor analytics (see core.ts): summary numbers per site, one visitor's whole journey across sites, and CSV. CANONICAL SOURCE; copied byte for byte
// to the IT Services private console. Read-only (except `settings` in the console itself). Everything returned is already free of names, mobile numbers and typed text.
import { SITES, STEPS, ensureSchema, fullIpOn, stepsOf, type D1Like, type SiteCfg } from "./core";

const DAY = 86_400_000;
export interface SessRow {
  sid: string; site: string; vid: string | null; cvid: string | null; iph: string | null; ipshort: string | null; ip_full: string | null; first_ms: number; last_ms: number; landing: string | null;
  src: string | null; ref_host: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; device: string | null; browser: string | null; os: string | null;
  lang: string | null; country: string | null; city: string | null; network: string | null; is_bot: number; visit_no: number; ip_visit_no: number; pages: number;
  exit_path: string | null; exit_section: string | null; exit_ms: number | null; exit_scroll: number | null; steps: number; org: string | null;
}
const COLS = "s.sid,s.site,s.vid,COALESCE(al.canon,s.vid) AS cvid,s.iph,s.ipshort,s.ip_full,s.first_ms,s.last_ms,s.landing,s.src,s.ref_host,s.utm_source,s.utm_medium,s.utm_campaign,s.device,s.browser,s.os,s.lang,s.country,s.city,s.network,s.is_bot,s.visit_no,s.ip_visit_no,s.pages,s.exit_path,s.exit_section,s.exit_ms,s.exit_scroll,s.steps,s.org";
const FROM = "FROM a_session s LEFT JOIN a_alias al ON al.old=s.vid";

const tally = <T>(xs: T[], key: (x: T) => string | null | undefined, top = 15) => {
  const m = new Map<string, number>(); for (const x of xs) { const k = key(x); if (k != null && k !== "") m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, top).map(([k, n]) => ({ k, n }));
};
const rate1 = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** The Monday of the week a moment falls in (UTC), as a date. */
const weekOf = (ms: number) => { const d = new Date(ms); const k = (d.getUTCDay() + 6) % 7; return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - k)); };

export interface Person { first: SessRow; steps: number; sessions: number; returning: boolean }
/** One entry per visitor (a person is the visitor id, resolved through the alias table, or the session when there is none). `returning` = at least one of their visits in scope was not their first visit on that site. */
function people(humans: SessRow[], keyOf: (r: SessRow) => string): Person[] {
  const m = new Map<string, SessRow[]>(); for (const r of humans) { const k = keyOf(r), a = m.get(k); if (a) a.push(r); else m.set(k, [r]); }
  return [...m.values()].map((a) => { const s = [...a].sort((x, y) => x.first_ms - y.first_ms); return { first: s[0]!, steps: s.reduce((t, x) => t | x.steps, 0), sessions: s.length, returning: s.some((x) => x.visit_no > 1) }; });
}
const vkey = (r: SessRow) => (r.cvid ?? r.sid);

/** The numbers that come from session rows. Pure, so the arithmetic is tested on its own. */
export function summarize(rows: SessRow[], sites: SiteCfg[] = SITES) {
  const humans = rows.filter((r) => !r.is_bot), bots = rows.filter((r) => r.is_bot);
  const all = people(humans, vkey), isNew = (p: Person) => !p.returning;
  const ex = humans.filter((r) => r.exit_path);
  const bySite = sites.map((c) => {
    const h = humans.filter((r) => r.site === c.key), pp = people(h, vkey), e = h.filter((r) => r.exit_path);
    return { site: c.key, name: c.name, visitors: pp.length, newVisitors: pp.filter(isNew).length, returningVisitors: pp.filter((p) => !isNew(p)).length, sessions: h.length, bots: bots.filter((r) => r.site === c.key).length,
      avgPages: h.length ? Math.round((h.reduce((a, r) => a + r.pages, 0) / h.length) * 10) / 10 : 0, avgTimeOnLastPageMs: avg(e.map((r) => r.exit_ms ?? 0)),
      reachedSignin: pp.filter((p) => stepsOf(p.steps).includes("signin")).length, paid: pp.filter((p) => stepsOf(p.steps).includes("paid")).length,
      lastSeenMs: h.reduce((a, r) => Math.max(a, r.last_ms), 0) || null };
  });
  const funnel = STEPS.map((step, i) => { const n = all.filter((p) => (p.steps & (1 << i)) !== 0).length; return { step, visitors: n, ofVisits: rate1(n, all.length) }; });
  const bySrc = new Map<string, { src: string; label: string; visitors: number; signin: number; published: number; paid: number }>();
  for (const p of all) { const k = (p.first.src ?? "direct") + "|" + (p.first.ref_host ?? ""), o = bySrc.get(k) ?? { src: p.first.src ?? "direct", label: p.first.ref_host ?? "", visitors: 0, signin: 0, published: 0, paid: 0 }; const st = stepsOf(p.steps); o.visitors++; if (st.includes("signin")) o.signin++; if (st.includes("published")) o.published++; if (st.includes("paid")) o.paid++; bySrc.set(k, o); }
  const trend = (keyFn: (ms: number) => string) => {
    const m = new Map<string, SessRow[]>(); for (const r of rows) { const k = keyFn(r.first_ms), a = m.get(k); if (a) a.push(r); else m.set(k, [r]); }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, rs]) => { const hs = rs.filter((r) => !r.is_bot), pp = people(hs, vkey); return { period: k, sessions: hs.length, visitors: pp.length, newVisitors: pp.filter(isNew).length, returningVisitors: pp.filter((p) => !isNew(p)).length, bots: rs.length - hs.length }; });
  };
  const botMap = new Map<string, { name: string; sessions: number; lastMs: number; pages: Set<string> }>();
  for (const r of bots) { const n = r.browser ?? "unknown", o = botMap.get(n) ?? { name: n, sessions: 0, lastMs: 0, pages: new Set<string>() }; o.sessions++; o.lastMs = Math.max(o.lastMs, r.last_ms); if (r.landing) o.pages.add(r.site + r.landing); botMap.set(n, o); }
  return {
    humans: { visitors: all.length, newVisitors: all.filter(isNew).length, returningVisitors: all.filter((p) => !isNew(p)).length, sessions: humans.length, returningIps: new Set(humans.filter((r) => r.iph && r.ip_visit_no > 1).map((r) => r.iph)).size,
      avgPagesPerSession: humans.length ? Math.round((humans.reduce((a, r) => a + r.pages, 0) / humans.length) * 10) / 10 : 0, singlePageShare: rate1(humans.filter((r) => r.pages <= 1).length, humans.length), avgTimeOnLastPageMs: avg(ex.map((r) => r.exit_ms ?? 0)), avgScrollPct: avg(ex.map((r) => r.exit_scroll ?? 0)) },
    bots: { sessions: bots.length, crawlers: [...botMap.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 20).map((o) => ({ name: o.name, sessions: o.sessions, lastMs: o.lastMs, pages: [...o.pages].sort().slice(0, 12) })) },
    bySite,
    sources: tally(humans, (r) => (r.src ?? "direct") + (r.ref_host ? " / " + r.ref_host : "")), campaigns: tally(humans, (r) => (r.utm_campaign ? `${r.utm_source ?? "?"} / ${r.utm_medium ?? "?"} / ${r.utm_campaign}` : null)),
    entryPages: tally(humans, (r) => r.site + (r.landing ?? "")), exitPages: tally(ex, (r) => r.site + r.exit_path), exitSections: tally(ex, (r) => (r.exit_section ? r.site + "#" + r.exit_section : null)),
    devices: tally(humans, (r) => r.device ?? "?"), browsers: tally(humans, (r) => r.browser ?? "?"), systems: tally(humans, (r) => r.os ?? "?"), languages: tally(humans, (r) => (r.lang ?? "").slice(0, 2).toLowerCase() || "?"),
    countries: tally(humans, (r) => r.country ?? "?"), cities: tally(humans, (r) => (r.city ? `${r.country ?? "?"} / ${r.city}` : null)), networks: tally(humans, (r) => r.network ?? null),
    funnel, convertedBySource: [...bySrc.values()].sort((a, b) => b.visitors - a.visitors).map((o) => ({ ...o, paidRate: rate1(o.paid, o.visitors) })),
    daily: trend(isoDay), weekly: trend(weekOf),
  };
}

export function parseRange(sp: URLSearchParams, now: number): { from: number; to: number } {
  const one = (v: string | null, endOfDay: boolean): number | null => { if (!v) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const t = Date.parse(v + "T00:00:00Z"); return Number.isFinite(t) ? t + (endOfDay ? DAY : 0) : null; } const n = Number(v); return Number.isFinite(n) && n > 1e11 ? n : null; };
  let to = one(sp.get("to"), true) ?? now + 1, from = one(sp.get("from"), false) ?? to - 30 * DAY;
  if (from >= to) from = to - DAY;
  if (to - from > 366 * DAY) from = to - 366 * DAY;
  return { from, to };
}
const siteArg = (site?: string) => (site && SITES.some((s) => s.key === site) ? site : "");

async function sessionRows(db: D1Like, from: number, to: number, site: string): Promise<SessRow[]> {
  return (await db.prepare(`SELECT ${COLS} ${FROM} WHERE s.first_ms>=? AND s.first_ms<? ${site ? "AND s.site=?" : ""} ORDER BY s.first_ms LIMIT 30000`).bind(...(site ? [from, to, site] : [from, to])).all<SessRow>()).results ?? [];
}

export async function summary(db: D1Like, o: { site?: string; from: number; to: number }, now = Date.now()) {
  await ensureSchema(db);
  const site = siteArg(o.site), { from, to } = o, sb = site ? [site] : [];
  const rows = await sessionRows(db, from, to, site), base = summarize(rows);
  const ev = `FROM a_event e JOIN a_session s ON s.sid=e.sid WHERE e.at_ms>=? AND e.at_ms<? AND s.is_bot=0 ${site ? "AND e.site=?" : ""}`;
  const pages = (await db.prepare(`SELECT e.site AS site, e.path AS path, COUNT(CASE WHEN e.kind='pv' THEN 1 END) AS views, COUNT(DISTINCT CASE WHEN e.kind='pv' THEN e.sid END) AS sessions, COUNT(CASE WHEN e.kind='exit' THEN 1 END) AS leaves, AVG(CASE WHEN e.kind='exit' THEN e.n END) AS avg_ms, AVG(CASE WHEN e.kind='exit' THEN e.x END) AS avg_scroll ${ev} AND e.kind IN ('pv','exit') GROUP BY e.site, e.path ORDER BY views DESC LIMIT 200`).bind(from, to, ...sb).all<any>()).results ?? [];
  const sections = (await db.prepare(`SELECT e.site AS site, e.path AS path, e.name AS name, COUNT(DISTINCT e.sid||'|'||e.path) AS views, COALESCE(SUM(e.n),0) AS dwell ${ev} AND e.kind='sec' GROUP BY e.site, e.path, e.name ORDER BY views DESC LIMIT 120`).bind(from, to, ...sb).all<any>()).results ?? [];
  const actions = (await db.prepare(`SELECT e.site AS site, e.name AS name, e.val AS val, COUNT(*) AS c ${ev} AND e.kind='act' GROUP BY e.site, e.name, e.val ORDER BY c DESC LIMIT 200`).bind(from, to, ...sb).all<any>()).results ?? [];
  const d0 = isoDay(from), d1 = isoDay(to - 1);
  const agg = (await db.prepare(`SELECT day, site, dim, k, n, ms FROM a_agg WHERE day>=? AND day<=? ${site ? "AND site=?" : ""} ORDER BY day, site, dim, k LIMIT 3000`).bind(d0, d1, ...sb).all<any>()).results ?? [];
  const seen = (await db.prepare("SELECT site, COUNT(*) AS sessions, MAX(last_ms) AS last_ms FROM a_session GROUP BY site").all<any>()).results ?? [];
  return {
    from, to, fromDay: d0, toDay: d1, site: site || "all", asOf: now, fullIp: await fullIpOn(db, now), ...base,
    pages: pages.map((p: any) => ({ site: p.site, path: p.path, views: p.views, sessions: p.sessions, leaves: p.leaves, avgTimeMs: Math.round(p.avg_ms ?? 0), avgScrollPct: Math.round(p.avg_scroll ?? 0) })),
    sections: sections.map((s: any) => ({ site: s.site, section: s.path + "#" + s.name, views: s.views, avgDwellMs: s.views ? Math.round(s.dwell / s.views) : 0 })),
    actions: actions.map((a: any) => ({ site: a.site, name: a.name, dest: a.val, n: a.c })),
    privateCounts: agg.filter((x: any) => String(x.dim).startsWith("gpc_")), archived: agg.filter((x: any) => !String(x.dim).startsWith("gpc_")),
    coverage: SITES.map((c) => { const r = seen.find((x: any) => x.site === c.key); return { site: c.key, name: c.name, hosts: c.hosts, sessionsEver: r?.sessions ?? 0, lastSeenMs: r?.last_ms ?? null }; }),
    note: "Visitors are counted per person (visitor id, joined across sites). A visitor with Global Privacy Control or Do Not Track appears only in privateCounts. Funnel steps are flags: a visitor may reach them in any order.",
  };
}

/** One visitor's whole journey, across every site. id = a visitor id (32 hex; earlier ids of the same person are joined), ip_<32 hex> for a network-address hash, or s_<session id>. */
export async function journey(db: D1Like, id: string) {
  await ensureSchema(db);
  const q = (sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b).all<any>().then((r) => r.results ?? []);
  let by = "visitor id", where = "", args: unknown[] = [];
  if (id.startsWith("ip_")) { const h = id.slice(3); if (!/^[a-f0-9]{32}$/.test(h)) return null; by = "network address (hashed)"; where = "s.iph=?"; args = [h]; }
  else if (id.startsWith("s_")) { const s = id.slice(2); if (!/^[a-f0-9]{16,32}$/.test(s)) return null; by = "one visit"; where = "s.sid=?"; args = [s]; }
  else {
    if (!/^[a-f0-9]{32}$/.test(id)) return null;
    const canon = (await db.prepare("SELECT canon FROM a_alias WHERE old=?").bind(id).first<{ canon: string }>())?.canon ?? id;
    const vids = [canon, ...(await q("SELECT old FROM a_alias WHERE canon=? LIMIT 40", canon)).map((r) => r.old as string)];
    where = `s.vid IN (${vids.map(() => "?").join(",")})`; args = vids;
  }
  const sess = await q(`SELECT s.* FROM a_session s WHERE ${where} ORDER BY s.first_ms ASC LIMIT 100`, ...args);
  const out = [];
  for (const s of sess) { const events = await q("SELECT at_ms, kind, path, name, val, n, x FROM a_event WHERE sid=? ORDER BY id ASC LIMIT 600", s.sid); out.push({ ...s, stepNames: stepsOf(s.steps), events }); }
  return { id, by, firstSeenMs: sess[0]?.first_ms ?? null, visits: sess.length, sites: [...new Set(sess.map((s) => s.site as string))], sessions: out };
}

// ------------------------------------------------------------------------------------------------ CSV
/** A cell: quoted when needed, and a leading = + - @ is defused so a spreadsheet never runs a visitor-supplied value as a formula. */
export function cell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const line = (xs: unknown[]) => xs.map(cell).join(",");
export const CSV_KINDS = ["sessions", "events", "pages", "daily"] as const;
export type CsvKind = (typeof CSV_KINDS)[number];

export async function csv(db: D1Like, o: { kind: CsvKind; site?: string; from: number; to: number }): Promise<string> {
  await ensureSchema(db);
  const site = siteArg(o.site), { from, to } = o, L: string[] = [];
  if (o.kind === "sessions") {
    L.push(line(["site", "started_utc", "visitor_id", "visit_number", "new_or_returning", "human_or_bot", "address_short", "address_hash", "full_address", "country", "city", "network", "device", "browser", "system", "language", "source", "referrer_or_campaign", "utm_source", "utm_medium", "utm_campaign", "entry_page", "pages_seen", "exit_page", "exit_section", "seconds_on_last_page", "scroll_percent", "funnel_steps", "organizer_ref"]));
    for (const r of await sessionRows(db, from, to, site)) L.push(line([r.site, new Date(r.first_ms).toISOString(), r.cvid ?? "", r.visit_no, r.visit_no > 1 ? "returning" : "new", r.is_bot ? "bot" : "human", r.ipshort ?? "", r.iph ?? "", r.ip_full ?? "", r.country ?? "", r.city ?? "", r.network ?? "", r.device ?? "", r.browser ?? "", r.os ?? "", r.lang ?? "", r.src ?? "", r.ref_host ?? "", r.utm_source ?? "", r.utm_medium ?? "", r.utm_campaign ?? "", r.landing ?? "", r.pages, r.exit_path ?? "", r.exit_section ?? "", r.exit_ms == null ? "" : Math.round(r.exit_ms / 1000), r.exit_scroll ?? "", stepsOf(r.steps).join("|"), r.org ?? ""]));
  } else if (o.kind === "events") {
    L.push(line(["site", "session_id", "time_utc", "kind", "page", "name", "detail", "number", "scroll_percent"]));
    const rows = (await db.prepare(`SELECT e.site,e.sid,e.at_ms,e.kind,e.path,e.name,e.val,e.n,e.x FROM a_event e JOIN a_session s ON s.sid=e.sid WHERE e.at_ms>=? AND e.at_ms<? AND s.is_bot=0 ${site ? "AND e.site=?" : ""} ORDER BY e.id LIMIT 50000`).bind(from, to, ...(site ? [site] : [])).all<any>()).results ?? [];
    for (const r of rows) L.push(line([r.site, r.sid, new Date(r.at_ms).toISOString(), r.kind, r.path ?? "", r.name ?? "", r.val ?? "", r.n ?? "", r.x ?? ""]));
  } else if (o.kind === "pages") {
    L.push(line(["site", "page", "page_views", "visits", "leaves", "avg_seconds_on_page", "avg_scroll_percent"]));
    for (const p of (await summary(db, { site, from, to })).pages) L.push(line([p.site, p.path, p.views, p.sessions, p.leaves, Math.round(p.avgTimeMs / 1000), p.avgScrollPct]));
  } else {
    L.push(line(["period_start", "site", "visits", "visitors", "new_visitors", "returning_visitors", "crawler_visits"]));
    const rows = await sessionRows(db, from, to, site), keys = site ? [site] : SITES.map((s) => s.key);
    for (const k of keys) for (const t of summarize(rows.filter((r) => r.site === k)).daily) L.push(line([t.period, k, t.sessions, t.visitors, t.newVisitors, t.returningVisitors, t.bots]));
  }
  return L.join("\r\n") + "\r\n";
}
