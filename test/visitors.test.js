// The owner's visitor dashboard (functions/api/console/visitors.js): only the signed-in owner (or the read-only key, GET only), numbers from the central analytics database,
// a CSV download, one visitor's journey, and the full-address switch (owner only). Visits are put in through the REAL collector, then read back through the REAL handler.
// The copied analytics files must equal the canonical source (checksums in functions/_analytics/SOURCE.json). Run: bun test
import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeD1 } from "./d1-sqlite.js";
import { hmacHex } from "../functions/_lib.js";
import { onRequestPost as login } from "../functions/api/console/login.js";
import { onRequestGet as vget, onRequestPost as vpost } from "../functions/api/console/visitors.js";
import { collect, resetRate } from "../functions/_analytics/core.ts";

const OWNER = "owner@example.com", PASS = "4821", KEY = "k".repeat(40), READ = "r".repeat(32);
const T = Date.now(), SID = "b2".repeat(12), VID = "a1".repeat(16);
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36", IP = "203.0.113.77";
const analyticsDb = () => { // the central database stand-in (bun:sqlite); the tables are created by the collector itself
  const raw = new Database(":memory:");
  const stmt = (sql, vals = []) => ({ bind: (...v) => stmt(sql, v), run: async () => { const r = raw.query(sql).run(...vals); return { meta: { changes: r.changes } }; }, all: async () => ({ results: raw.query(sql).all(...vals) }), first: async () => raw.query(sql).get(...vals) ?? null });
  return { db: { prepare: (s) => stmt(s), batch: async (xs) => Promise.all(xs.map((x) => x.run())) }, raw };
};
let env, cookie, an;
beforeEach(async () => {
  resetRate(); an = analyticsDb();
  const d = makeD1();
  env = { DB: d.db, CONSOLE_KEY: KEY, CONSOLE_PASS_MAC: await hmacHex(KEY, "pass:" + PASS), CONSOLE_EMAIL: OWNER, ANALYTICS: an.db, ANALYTICS_KEY: "k-test", ANALYTICS_READ_KEY: READ };
  const r = await login({ request: new Request("https://x/api/console/login", { method: "POST", body: JSON.stringify({ email: OWNER, passcode: PASS }) }), env });
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
});
const visit = (host, events, sid = SID, vid = VID, ip = IP) => {
  const r = new Request(`https://${host}/api/t`, { method: "POST", headers: { origin: `https://${host}`, "content-type": "text/plain", "cf-connecting-ip": ip, "user-agent": UA }, body: JSON.stringify({ s: sid, d: vid, lp: "/", r: "www.google.com", dv: "mobile", l: "en-IN", e: events }) });
  r.cf = { country: "IN", city: "Pune", asOrganization: "Example Broadband", asn: 64500 };
  return collect(r, env, T);
};
const get = (qs = "", headers = {}) => vget({ request: new Request("https://x/api/console/visitors" + qs, { headers }), env });
const own = (qs = "") => get(qs, { cookie });
const post = (body, headers = {}) => vpost({ request: new Request("https://x/api/console/visitors", { method: "POST", headers, body: JSON.stringify(body) }), env });
const seed = async () => {
  expect((await visit("home.corporatetambola.com", [{ k: "pv", p: "/" }, { k: "sec", p: "/", n: "hero", m: 4200 }, { k: "act", p: "/", n: "go:/games", v: "/games" }, { k: "exit", p: "/", n: "hero", m: 30000, x: 80 }])).status).toBe(204);
  expect((await visit("home.corporatetambola.com", [{ k: "pv", p: "/" }, { k: "pv", p: "/pricing" }], "c3".repeat(12), "d4".repeat(16), "198.51.100.9")).status).toBe(204);
};

describe("who may read it", () => {
  test("without the session cookie or the read key, everything answers Not found (the page does not even say it exists)", async () => {
    await seed();
    for (const qs of ["", "?csv=sessions", "?journey=" + VID]) { const r = await get(qs); expect(r.status).toBe(404); expect(await r.json()).toEqual({ error: "Not found" }); }
    expect((await post({ fullIp: true })).status).toBe(404);
    expect((await get("", { "x-analytics-read-key": "wrong" + READ })).status).toBe(404);
    expect((await get("", { cookie: "ctc=9999999999999.deadbeef" })).status).toBe(404);
  });
  test("the read-only key (for the boss session) reads the numbers but can never change the switch", async () => {
    await seed();
    const r = await get("", { "x-analytics-read-key": READ }); expect(r.status).toBe(200); expect((await r.json()).reader).toBe("reader");
    expect((await post({ fullIp: true }, { "x-analytics-read-key": READ })).status).toBe(404);
    expect((await own()).status).toBe(200);
  });
  test("with no read key configured, an empty key header is not a way in", async () => {
    delete env.ANALYTICS_READ_KEY; expect((await get("", { "x-analytics-read-key": "" })).status).toBe(404);
  });
  test("signed in but the central database is not connected yet: a clear answer, not a crash", async () => {
    delete env.ANALYTICS; const r = await own(); expect(r.status).toBe(503); expect((await r.json()).error).toMatch(/not connected/);
    expect((await get("")).status).toBe(404); // and signed out still reveals nothing
  });
});

describe("what it shows", () => {
  test("a scripted visit appears in the numbers: people, new, pages, the funnel and coverage", async () => {
    await seed();
    const j = await (await own()).json();
    expect(j.humans).toMatchObject({ visitors: 2, newVisitors: 2, returningVisitors: 0, sessions: 2 });
    expect(j.bySite.find((s) => s.site === "home")).toMatchObject({ visitors: 2, sessions: 2 });
    expect(j.coverage.find((c) => c.site === "home").sessionsEver).toBe(2);
    expect(j.coverage.find((c) => c.site === "bingo").sessionsEver).toBe(0); // a site that has not reported yet says so
    expect(j.pages.find((p) => p.site === "home" && p.path === "/")).toMatchObject({ views: 2, leaves: 1, avgScrollPct: 80 });
    expect(j.sections.find((s) => s.section === "/#hero")).toMatchObject({ views: 1 });
    expect(j.actions.find((a) => a.name === "go:/games")).toMatchObject({ n: 1, dest: "/games" });
    expect(j.funnel.find((f) => f.step === "visit").visitors).toBe(2); expect(j.funnel.find((f) => f.step === "pricing").visitors).toBe(1);
    expect(j.fullIp).toBe(false);
  });
  test("the site filter narrows it, and an unknown site name is ignored rather than trusted", async () => {
    await seed(); await visit("bingo.corporatetambola.com", [{ k: "pv", p: "/" }], "e5".repeat(12), "f6".repeat(16), "192.0.2.5");
    expect((await (await own("?site=home")).json()).humans.sessions).toBe(2);
    expect((await (await own("?site=bingo")).json()).humans.sessions).toBe(1);
    expect((await (await own("?site=nope%27%3B--")).json()).site).toBe("all");
  });
  test("the numbers never carry a full network address, a name or a mobile number", async () => {
    await seed(); const all = JSON.stringify(await (await own()).json()) + (await (await own("?csv=sessions")).text());
    expect(all).not.toContain(IP); expect(all).not.toContain("198.51.100.9"); expect(all).toContain("203.0.113.0");
  });
});

describe("the isolated site keeps its own database", () => {
  const SITE = "lucifer"; // the dashboard reads this site's own database for exactly this key
  const isoVisit = (db) => { // that site's counter writes into ITS database (the isolated collector copy there is bound as ANALYTICS), never into the central one
    const r = new Request("https://" + SITE + "tech.com/api/t", { method: "POST", headers: { origin: "https://" + SITE + "tech.com", "content-type": "text/plain", "cf-connecting-ip": IP, "user-agent": UA }, body: JSON.stringify({ s: "e5".repeat(12), d: "f6".repeat(16), lp: "/", r: "", dv: "mobile", l: "en-IN", e: [{ k: "pv", p: "/" }] }) });
    r.cf = { country: "IN", city: "Pune", asOrganization: "Example Broadband", asn: 64500 };
    return collect(r, { ...env, ANALYTICS: db }, T);
  };
  const people = (j, key) => j.bySite.find((x) => x.site === key).visitors;
  test("asking for that site reads its own database; all and every other site read the central one and never show it", async () => {
    const iso = analyticsDb(); env.ANALYTICS_LUCIFER = iso.db;
    await seed(); expect((await isoVisit(iso.db)).status).toBe(204);
    const one = await (await own("?site=" + SITE)).json(); expect(one.site).toBe(SITE); expect(people(one, SITE)).toBe(1);
    const all = await (await own()).json(); expect(people(all, SITE)).toBe(0); expect(people(all, "home")).toBe(2);
    const home = await (await own("?site=home")).json(); expect(people(home, SITE)).toBe(0); expect(people(home, "home")).toBe(2);
    const csvOne = await (await own("?csv=sessions&site=" + SITE)).text(), csvAll = await (await own("?csv=sessions")).text();
    expect(csvOne).toContain(SITE); expect(csvOne).not.toContain("home.corporatetambola.com"); expect(csvOne.split("\n").filter((l) => l.startsWith(SITE)).length).toBe(1);
    expect(csvAll.split("\n").some((l) => l.startsWith(SITE + ","))).toBe(false);
  });
  test("the read-only key reads that site too", async () => {
    const iso = analyticsDb(); env.ANALYTICS_LUCIFER = iso.db;
    expect((await isoVisit(iso.db)).status).toBe(204);
    const r = await get("?site=" + SITE, { "x-analytics-read-key": READ }); expect(r.status).toBe(200); expect(people(await r.json(), SITE)).toBe(1);
  });
  test("without the isolated database bound, asking for that site says so and never falls back to the central one", async () => {
    await seed();
    const r = await own("?site=" + SITE); expect(r.status).toBe(503); expect((await r.json()).error).toMatch(/ANALYTICS_LUCIFER/);
    expect((await own()).status).toBe(200); expect((await own("?site=home")).status).toBe(200);
  });
});

describe("the spreadsheet and one visitor's journey", () => {
  test("every spreadsheet kind downloads as CSV with a header row and the seeded visit; a wrong kind is refused", async () => {
    await seed();
    for (const kind of ["sessions", "events", "pages", "daily"]) {
      const r = await own("?csv=" + kind); expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toMatch(/^text\/csv/); expect(r.headers.get("content-disposition")).toMatch(new RegExp(`attachment; filename="visitors-${kind}-\\d{4}-\\d{2}-\\d{2}\\.csv"`));
      expect(r.headers.get("cache-control")).toBe("no-store");
      const t = await r.text(); expect(t.split("\r\n")[0]).toContain("site"); expect(t).toContain("home");
    }
    expect((await own("?csv=everything")).status).toBe(400);
  });
  test("a visitor id gives that person's whole path, event by event; a code that matches nobody is Not found", async () => {
    await seed();
    const j = await (await own("?journey=" + VID)).json();
    expect(j.visits).toBe(1); expect(j.sites).toEqual(["home"]);
    expect(j.sessions[0].events.map((e) => e.kind)).toEqual(["pv", "sec", "act", "exit"]);
    expect((await own("?journey=" + "9".repeat(32))).status).toBe(200); // a well-formed id with no visits: an empty journey, not an error
    expect((await own("?journey=not-a-code")).status).toBe(404);
  });
});

describe("the full-address switch", () => {
  test("it is OFF, the owner can turn it on and off, and a wrong body is refused", async () => {
    expect((await (await own()).json()).fullIp).toBe(false);
    expect((await post({ fullIp: "yes" }, { cookie })).status).toBe(400);
    expect(await (await post({ fullIp: true }, { cookie })).json()).toEqual({ ok: true, fullIp: true });
    expect((await (await own()).json()).fullIp).toBe(true);
    await post({ fullIp: false }, { cookie }); expect((await (await own()).json()).fullIp).toBe(false);
  });
});

describe("the page and the copied files", () => {
  test("the page is private (noindex, not linked, not in the sitemap) and draws values only with textContent", () => {
    const html = readFileSync(join(import.meta.dir, "..", "static", "visitors.html"), "utf8"), js = readFileSync(join(import.meta.dir, "..", "static", "visitors.js"), "utf8");
    expect(html).toContain('name="robots" content="noindex, nofollow"'); expect(html).not.toMatch(/<script>|<script [^>]*>[^<]/); // only an external script, so the CSP (script-src 'self') allows it
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(readFileSync(join(import.meta.dir, "..", "build.py"), "utf8")).not.toMatch(/PATHS = \[[^\]]*visitors/);
  });
  test("the copied analytics files equal the canonical source (line endings ignored)", () => {
    const side = JSON.parse(readFileSync(join(import.meta.dir, "..", "functions", "_analytics", "SOURCE.json"), "utf8"));
    for (const [rel, sha] of Object.entries(side.files)) expect(createHash("sha256").update(readFileSync(join(import.meta.dir, "..", rel), "utf8").replace(/\r\n/g, "\n")).digest("hex")).toBe(sha);
    expect(Object.keys(side.files).length).toBe(2);
  });
  test("wrangler.toml binds the central database, the isolated site's own database and the payment database, each with its real id", () => {
    const toml = readFileSync(join(import.meta.dir, "..", "wrangler.toml"), "utf8").replace(/\r\n/g, "\n");
    expect(toml).toMatch(/^binding = "ANALYTICS"\ndatabase_name = "site-analytics"\ndatabase_id = "056cf051-6cf9-4e9e-b8f8-bc5fdfd3c817"$/m);
    expect(toml).toMatch(/^binding = "ANALYTICS_LUCIFER"\ndatabase_name = "lucifer-analytics"\ndatabase_id = "9f4773a5-19e2-4890-8029-94bb0a369035"$/m);
    expect(toml).toMatch(/^binding = "DB"\ndatabase_name = "itservices-payments"\ndatabase_id = "a41c7b07-9536-4e95-b7a1-d41ef8e57384"$/m);
  });
});
