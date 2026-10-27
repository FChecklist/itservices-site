// The owner's private console (functions/_console.js, functions/api/console/*): one person, a passcode that is never stored in clear, a lock after five wrong tries,
// and no data without the session cookie. Run: bun test
import { describe, expect, test, beforeEach } from "bun:test";
import { makeD1 } from "./d1-sqlite.js";
import { hmacHex } from "../functions/_lib.js";
import { onRequestPost as login } from "../functions/api/console/login.js";
import { onRequestGet as data } from "../functions/api/console/data.js";
import { onRequestPost as logout } from "../functions/api/console/logout.js";
import { onRequestGet as linksGet, onRequestPost as linksPost } from "../functions/api/console/links.js";

const OWNER = "owner@example.com", PASS = "4821", KEY = "k".repeat(40);
let d, env;
beforeEach(async () => {
  d = makeD1();
  env = { DB: d.db, CONSOLE_KEY: KEY, CONSOLE_PASS_MAC: await hmacHex(KEY, "pass:" + PASS), CONSOLE_EMAIL: OWNER, OWNER_STATS_KEY: "sk" };
});
const post = (b) => login({ request: new Request("https://x/api/console/login", { method: "POST", body: JSON.stringify(b) }), env });
const cookieOf = (r) => (r.headers.get("set-cookie") ?? "").split(";")[0];
const getData = (cookie) => data({ request: new Request("https://x/api/console/data", { headers: cookie ? { cookie } : {} }), env });

describe("sign-in", () => {
  test("the right e-mail and passcode give a session cookie that is HttpOnly, Secure and SameSite=Strict", async () => {
    const r = await post({ email: OWNER.toUpperCase(), passcode: PASS });
    expect(r.status).toBe(200);
    const sc = r.headers.get("set-cookie");
    expect(sc).toMatch(/HttpOnly/); expect(sc).toMatch(/Secure/); expect(sc).toMatch(/SameSite=Strict/);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  test("a wrong passcode and a wrong e-mail give the same answer, so neither is revealed", async () => {
    const a = await post({ email: OWNER, passcode: "0000" }), b = await post({ email: "other@example.com", passcode: PASS });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(await a.text()).toBe(await b.text());
  });
  test("five wrong tries lock it for an hour, and then even the right passcode is refused", async () => {
    for (let i = 0; i < 5; i++) expect((await post({ email: OWNER, passcode: "000" + i })).status).toBe(401);
    const locked = await post({ email: OWNER, passcode: PASS });
    expect(locked.status).toBe(429); expect((await locked.json()).minutes).toBeGreaterThan(0);
    expect(locked.headers.get("set-cookie")).toBeNull();
  });
  test("an old lock ends: the same five tries two hours ago no longer block", async () => {
    const old = Date.now() - 2 * 3600_000;
    for (let i = 0; i < 5; i++) d.raw.query("INSERT INTO console_attempt(at_ms,ok) VALUES(?,0)").run(old + i);
    expect((await post({ email: OWNER, passcode: PASS })).status).toBe(200);
  });
  test("with no secrets configured the address answers the plain 404 and accepts nothing", async () => {
    delete env.CONSOLE_PASS_MAC;
    expect((await post({ email: OWNER, passcode: PASS })).status).toBe(404);
  });
  test("nothing typed is stored: the attempt table has a time and a yes/no only", async () => {
    await post({ email: OWNER, passcode: "9999" });
    const cols = d.raw.query("PRAGMA table_info(console_attempt)").all().map((c) => c.name);
    expect(cols).toEqual(["id", "at_ms", "ok"]);
  });
});

describe("the data", () => {
  test("no cookie, a forged cookie, an expired cookie and a cookie signed with another key all get the plain 404", async () => {
    const exp = Date.now() + 3600_000;
    const forged = `ctc=${exp}.${"a".repeat(64)}`;
    const expiredNum = Date.now() - 1000;
    const expired = `ctc=${expiredNum}.${await hmacHex(KEY, "sess:" + expiredNum)}`;
    const other = `ctc=${exp}.${await hmacHex("z".repeat(40), "sess:" + exp)}`;
    for (const c of [undefined, forged, expired, other]) expect((await getData(c)).status).toBe(404);
  });
  test("a signed-in owner gets sites, Tambola numbers, and who paid; the stats key is sent to Tambola only", async () => {
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,payer_email,payer_phone,currency,amount_minor,status,is_test,captured_ms,updated_ms) VALUES('pay_1','corporate-tambola.pages.dev','boss@acme.com','+919800000000','INR',239900,'paid',0,?,?)").run(Date.now(), Date.now());
    d.raw.query("INSERT INTO payment(rzp_payment_id,site,payer_email,currency,amount_minor,status,is_test,captured_ms,updated_ms) VALUES('pay_2','corporate-tambola.pages.dev','test@acme.com','INR',100,'paid',1,?,?)").run(Date.now(), Date.now());
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push([String(url), init?.headers?.["x-owner-stats-key"] ?? null]); return String(url).endsWith("/api/owner/stats") ? new Response(JSON.stringify({ games: { made: 7 }, release: { version: "1.3.3" } })) : new Response(JSON.stringify({ commit: "abc1234" })); };
    try {
      const c = cookieOf(await post({ email: OWNER, passcode: PASS }));
      const r = await getData(c); expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.tambola.games.made).toBe(7);
      const tam = j.sites.find((x) => x.host === "corporate-tambola.pages.dev"); expect(tam.paidOrders).toBe(1); expect(tam.revenueMinor).toBe(239900);
      expect(j.payers.map((p) => p.email)).toEqual(["boss@acme.com"]); // the Rs 1 payment test is not a customer
      expect(j.payers[0].phone).toBe("+919800000000");
      const withKey = seen.filter(([, k]) => k); expect(withKey.length).toBe(1); expect(withKey[0][0]).toContain("corporatetambola.com/api/owner/stats");
    } finally { globalThis.fetch = realFetch; }
  });
  test("when Tambola does not answer, the console still opens and says so", async () => {
    const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("down"); };
    try {
      const c = cookieOf(await post({ email: OWNER, passcode: PASS }));
      const j = await (await getData(c)).json();
      expect(j.tambola.error).toBeTruthy();
    } finally { globalThis.fetch = realFetch; }
  });
  test("signing out clears the cookie", async () => {
    const r = await logout();
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});

describe("prospect links", () => {
  const lget = (cookie) => linksGet({ request: new Request("https://x/api/console/links", { headers: cookie ? { cookie } : {} }), env });
  const lpost = (cookie, body) => linksPost({ request: new Request("https://x/api/console/links", { method: "POST", headers: cookie ? { cookie } : {}, body: JSON.stringify(body) }), env });
  test("without the session cookie both calls answer the plain 404 and nothing is sent to the game", async () => {
    const realFetch = globalThis.fetch; let called = 0; globalThis.fetch = async () => { called++; return new Response("{}"); };
    try { expect((await lget()).status).toBe(404); expect((await lpost(undefined, { game: "corporate-tambola", action: "create" })).status).toBe(404); expect(called).toBe(0); } finally { globalThis.fetch = realFetch; }
  });
  test("a signed-in owner makes, lists and switches links; the link key goes to the game only, and a bad game or action is refused", async () => {
    env.OWNER_LINK_KEY = "lk";
    const seen = []; const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push([String(url), init?.method, init?.headers?.["x-owner-link-key"], init?.body ?? null]); return new Response(JSON.stringify(init?.method === "GET" ? { links: [{ id: "abc", label: "Asha", cap: 100, state: "active", link: "https://corporatetambola.com/zc.html?pass=" + "a".repeat(32) }] } : { ok: true, link: "https://corporatetambola.com/zc.html?pass=" + "b".repeat(32) })); };
    try {
      const c = cookieOf(await post({ email: OWNER, passcode: PASS }));
      const g = await (await lget(c)).json(); expect(g.games[0].links[0].label).toBe("Asha");
      const m = await lpost(c, { game: "corporate-tambola", action: "create", label: "Asha", cap: 100, days: 7 }); expect(m.status).toBe(200);
      expect(seen.every(([u, , k]) => u === "https://corporatetambola.com/api/owner/prospect-links" && k === "lk")).toBe(true);
      expect(JSON.parse(seen[1][3])).toEqual({ action: "create", label: "Asha", cap: 100, days: 7 });
      expect((await lpost(c, { game: "corporate-tambola", action: "disable", id: "abcdef1234" })).status).toBe(200);
      expect((await lpost(c, { game: "nope", action: "create" })).status).toBe(400);
      expect((await lpost(c, { game: "corporate-tambola", action: "delete" })).status).toBe(400);
    } finally { globalThis.fetch = realFetch; }
  });
  test("when the game is not connected the owner is told so, plainly", async () => {
    delete env.OWNER_LINK_KEY;
    const c = cookieOf(await post({ email: OWNER, passcode: PASS }));
    const g = await (await lget(c)).json(); expect(g.games[0].error).toContain("not connected");
  });
});

describe("make one game free", () => {
  test("a signed-in owner's request reaches the game with the game id and reason; without the cookie nothing is sent", async () => {
    env.OWNER_LINK_KEY = "lk"; const seen = []; const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push(JSON.parse(init?.body ?? "{}")); return new Response(JSON.stringify({ ok: true, pack: 100 })); };
    const post2 = (cookie, body) => linksPost({ request: new Request("https://x/api/console/links", { method: "POST", headers: cookie ? { cookie } : {}, body: JSON.stringify(body) }), env });
    try {
      expect((await post2(undefined, { game: "corporate-tambola", action: "free", eid: "Ex9mvd7" })).status).toBe(404); expect(seen.length).toBe(0);
      const c = cookieOf(await post({ email: OWNER, passcode: PASS }));
      expect((await post2(c, { game: "corporate-tambola", action: "free", eid: "Ex9mvd7", reason: "prospect demo" })).status).toBe(200);
      expect(seen[0]).toEqual({ action: "free", eid: "Ex9mvd7", reason: "prospect demo" });
    } finally { globalThis.fetch = realFetch; }
  });
});

describe("make the next game for a prospect", () => {
  const post2 = (cookie, body) => linksPost({ request: new Request("https://x/api/console/links", { method: "POST", headers: cookie ? { cookie } : {}, body: JSON.stringify(body) }), env });
  test("a signed-in owner's request reaches the game with the old game id, the start time, the gap and the reason, and nothing else; without the cookie nothing is sent", async () => {
    env.OWNER_LINK_KEY = "lk"; const seen = []; const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push({ url: String(url), key: init?.headers?.["x-owner-link-key"], body: JSON.parse(init?.body ?? "{}") }); return new Response(JSON.stringify({ ok: true, id: "Ex9mvd7-ABCD", openUrl: "https://corporatetambola.com/zc.html?e=Ex9mvd7-ABCD" })); };
    try {
      const body = { game: "corporate-tambola", action: "clone", from: "Ex9mvd7", startMs: 1793163600000, callSeconds: 12, reason: "first game went wrong", extra: "x".repeat(10) };
      expect((await post2(undefined, body)).status).toBe(404); expect(seen.length).toBe(0);
      const c = cookieOf(await post({ email: OWNER, passcode: PASS }));
      const r = await post2(c, body); expect(r.status).toBe(200); expect((await r.json()).id).toBe("Ex9mvd7-ABCD");
      expect(seen).toHaveLength(1); expect(seen[0].url).toBe("https://corporatetambola.com/api/owner/prospect-links"); expect(seen[0].key).toBe("lk");
      expect(seen[0].body).toEqual({ action: "clone", from: "Ex9mvd7", startMs: 1793163600000, callSeconds: 12, reason: "first game went wrong" });
      // the gap defaults to 12 s, and the fields are cut to their limits
      await post2(c, { game: "corporate-tambola", action: "clone", from: "E".repeat(80), startMs: 1793163600000, reason: "r".repeat(200) });
      expect(seen[1].body.callSeconds).toBe(12); expect(seen[1].body.from.length).toBe(40); expect(seen[1].body.reason.length).toBe(80);
    } finally { globalThis.fetch = realFetch; }
  });
});
