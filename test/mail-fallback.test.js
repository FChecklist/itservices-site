// Tests of the second mail route (Cloudflare Email Service): functions/_mail.js and its two call sites, the payment-test receipt (_testmail.js) and the owner's ledger report (api/pay/report.js).
// Owner decision 17 Nov 2026 + the Resend monthly quota that ran out on 20 Nov 2026. Resend and Cloudflare are replaced by a stand-in that records every call.
// Written with node:test + node:assert, so the SAME file runs under both runners:   node --test test/mail-fallback.test.js    and    bun test test/mail-fallback.test.js
// The receipt and report tests run against the REAL migrations in an in-memory SQLite (bun:sqlite under bun, node:sqlite under node).
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAIL_FETCH_MS, MAIL_TRIES, RESEND_PAUSE_MS, cfFrom, cfMailOf, forgetResendPause, sendMail } from "../functions/_mail.js";
import { receiptOf, sendTestReceipt } from "../functions/_testmail.js";
import { onRequestPost as reportRoute } from "../functions/api/pay/report.js";
import { ITS_HOST } from "../functions/_lib.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACC = "ac433821e311dbc89d0e002a192f92bc", CF_TOKEN = "cf-secret-token-xyz", RS_KEY = "re_secret_key_abc", REPORT_KEY = "report-key-123";
const OWNER = "rajatsiroffice@gmail.com", BUYER = "asha@example.com", TO = "boss@acme.example";
const T0 = Date.UTC(2026, 10, 25, 6, 0, 0), MIN = 60_000;
const RESEND_URL = "https://api.resend.com/emails", CF_URL = `https://api.cloudflare.com/client/v4/accounts/${ACC}/email/sending/send`;
const MSG = { from: "IT Services Ledger <reports@send.veridian-aios.com>", cfFrom: "IT Services Ledger <reports@veridian-aios.com>", to: TO, subject: "Daily ledger", text: "LEDGER TEXT BODY", html: "<p>LEDGER HTML BODY</p>", idem: "test-key-1" };
// a provider answer that carries an address, a token and free text: none of it may reach a log
const QUOTA = { status: 429, body: { name: "monthly_quota_exceeded", message: `The monthly quota of ${OWNER} is used up (key ${RS_KEY})` } };
const OK = { status: 200, body: { id: "mail_1" } };
const CF_OK = { status: 200, body: { success: true, result: { delivered: [TO] } } };

const realFetch = globalThis.fetch, realWarn = console.warn, realTimeout = AbortSignal.timeout;
let calls, warns, timeouts, resend, cf, env;
const by = (who) => calls.filter((c) => c.who === who);
const mkEnv = (over = {}) => ({ RESEND_API_KEY: RS_KEY, CF_EMAIL_TOKEN: CF_TOKEN, CF_ACCOUNT_ID: ACC, MAIL_RETRY_MS: "0", ...over });
const send = (over = {}, now = T0, e = env) => sendMail(e, { ...MSG, ...over }, now);
const everything = (...xs) => JSON.stringify(xs);
function noLeak(text) { for (const s of [TO, OWNER, BUYER, CF_TOKEN, RS_KEY, "LEDGER TEXT BODY", "LEDGER HTML BODY", "is used up", "not verified"]) assert.ok(!text.includes(s), `a log line holds "${s}": ${text}`); }

beforeEach(() => {
  calls = []; warns = []; timeouts = []; forgetResendPause();
  resend = () => OK; cf = () => CF_OK; env = mkEnv();
  console.warn = (...a) => { warns.push(a.join(" ")); };
  AbortSignal.timeout = (ms) => { timeouts.push(ms); return realTimeout.call(AbortSignal, ms); };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), who = u === RESEND_URL ? "resend" : u.startsWith("https://api.cloudflare.com/client/v4/accounts/") ? "cf" : null;
    if (!who) return new Response(JSON.stringify({ items: [] }), { status: 200 }); // Razorpay (the report asks it) and anything else
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ who, url: u, method: init.method, headers, body: JSON.parse(init.body), signal: init.signal ?? null });
    const r = (who === "resend" ? resend : cf)(by(who).length);
    if (r === "throw") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; AbortSignal.timeout = realTimeout; });

describe("Resend answers 'quota used up': one try, then the same mail through Cloudflare, once", () => {
  test("429 monthly_quota_exceeded: Resend is asked ONCE, Cloudflare gets the same mail with the SAME key, and the mail counts as sent", async () => {
    resend = () => QUOTA;
    const r = await send();
    assert.deepEqual(r, { ok: true, via: "cloudflare", status: "sent_by_cloudflare" });
    assert.equal(by("resend").length, 1); assert.equal(by("cf").length, 1);
    const c = by("cf")[0], q = by("resend")[0];
    assert.equal(c.url, CF_URL); assert.equal(c.method, "POST"); assert.equal(c.headers.authorization, `Bearer ${CF_TOKEN}`);
    assert.equal(c.headers["idempotency-key"], "test-key-1"); assert.equal(q.headers["idempotency-key"], "test-key-1"); // one key for the mail on both routes
    assert.deepEqual(c.body, { from: "IT Services Ledger <reports@veridian-aios.com>", to: TO, subject: "Daily ledger", text: "LEDGER TEXT BODY", html: "<p>LEDGER HTML BODY</p>" });
    assert.deepEqual(q.body.to, [TO]); // Resend takes a list, Cloudflare a single address
    assert.deepEqual(warns, ["[mail] resend_failed 429 monthly_quota_exceeded; sent_by_cloudflare"]);
  });
  test("a daily quota counts as a quota too", async () => {
    resend = () => ({ status: 429, body: { name: "daily_quota_exceeded" } });
    assert.equal((await send()).status, "sent_by_cloudflare"); assert.equal(by("resend").length, 1);
  });
  test("a 429 rate limit is NOT a quota: it is asked again and no pause is made", async () => {
    resend = (n) => (n === 1 ? { status: 429, body: { name: "rate_limit_exceeded" } } : OK);
    assert.equal((await send()).status, "sent"); assert.equal(by("resend").length, 2); assert.equal(by("cf").length, 0);
    resend = () => OK; await send({}, T0 + MIN); assert.equal(by("resend").length, 3); // not paused
  });
  test("after a quota answer Resend is not asked again for 30 minutes (every mail goes straight to Cloudflare), then it is asked again", async () => {
    resend = () => QUOTA;
    await send({ idem: "m1" });
    assert.equal(by("resend").length, 1); assert.equal(by("cf").length, 1);
    const r2 = await send({ idem: "m2" }, T0 + 10 * MIN); // inside the pause: no call to Resend at all
    assert.equal(r2.status, "sent_by_cloudflare"); assert.equal(by("resend").length, 1); assert.equal(by("cf").length, 2);
    assert.equal(warns[1], "[mail] resend_failed 429 quota (paused); sent_by_cloudflare");
    await send({ idem: "m3" }, T0 + RESEND_PAUSE_MS - 1); assert.equal(by("resend").length, 1); // the last millisecond of the pause
    resend = () => OK; // the plan has been reset
    const r4 = await send({ idem: "m4" }, T0 + RESEND_PAUSE_MS); // the pause is over: Resend is asked again and takes it
    assert.equal(r4.status, "sent"); assert.equal(by("resend").length, 2); assert.equal(by("cf").length, 3);
  });
  test("the pause belongs to the second route: without the two secrets Resend is asked every time", async () => {
    resend = () => QUOTA; await send();
    const bare = mkEnv({ CF_EMAIL_TOKEN: undefined });
    await send({}, T0 + MIN, bare); assert.equal(by("resend").length, 2); assert.equal(by("cf").length, 1);
  });
});

describe("a busy or broken Resend: asked again, then the same mail through Cloudflare, one key, no double send", () => {
  test("500 on all three tries: Resend 3 times, then Cloudflare once; the four calls share one key", async () => {
    resend = () => ({ status: 500 });
    const r = await send({ idem: undefined }); // no key given: one is made for the mail
    assert.equal(r.status, "sent_by_cloudflare"); assert.equal(MAIL_TRIES, 3);
    assert.equal(by("resend").length, 3); assert.equal(by("cf").length, 1);
    const keys = new Set(calls.map((c) => c.headers["idempotency-key"])); assert.equal(keys.size, 1); assert.ok([...keys][0].length >= 16);
    assert.deepEqual(warns, ["[mail] resend_failed 500; sent_by_cloudflare"]);
  });
  test("no answer at all (the call fails every time): Cloudflare takes it, the reason is 'network'", async () => {
    resend = () => "throw";
    assert.equal((await send()).status, "sent_by_cloudflare"); assert.equal(by("resend").length, 3);
    assert.deepEqual(warns, ["[mail] resend_failed network; sent_by_cloudflare"]);
  });
  test("Resend answers on the second or third try: Cloudflare is never used (no double send)", async () => {
    resend = (n) => (n < 3 ? { status: n === 1 ? 502 : 503 } : OK);
    assert.equal((await send()).status, "sent"); assert.equal(by("resend").length, 3); assert.equal(by("cf").length, 0); assert.deepEqual(warns, []);
  });
  test("Resend accepts the mail at once: one call, nothing else", async () => {
    const r = await send(); assert.deepEqual(r, { ok: true, via: "resend", status: "sent" }); assert.equal(calls.length, 1);
  });
  test("every call to a provider has a time limit of 4 seconds", async () => {
    resend = () => ({ status: 500 }); await send();
    assert.equal(MAIL_FETCH_MS, 4000); assert.equal(calls.length, 4); assert.deepEqual(timeouts, [4000, 4000, 4000, 4000]);
    for (const c of calls) assert.ok(c.signal instanceof AbortSignal);
  });
  test("between the tries it waits (a little longer each time) when MAIL_RETRY_MS says so", async () => {
    resend = () => ({ status: 500 });
    const t = Date.now(); await send({}, T0, mkEnv({ MAIL_RETRY_MS: "20" })); // waits 20 ms, then 40 ms
    assert.ok(Date.now() - t >= 55, "it did not wait between the tries");
  });
});

describe("what is NOT sent a second way, and what is reported when nothing works", () => {
  for (const [status, name] of [[400, "validation_error"], [401, "missing_api_key"], [403, "validation_error"], [404, "not_found"], [422, "invalid_to_address"]]) {
    test(`a plain refusal (${status} ${name}) is not repeated and not sent through Cloudflare`, async () => {
      resend = () => ({ status, body: { name, message: `refused for ${OWNER}` } });
      const r = await send();
      assert.deepEqual(r, { ok: false, via: "", status: `refused ${status} ${name}` });
      assert.equal(by("resend").length, 1); assert.equal(by("cf").length, 0);
      assert.deepEqual(warns, [`[mail] send_failed ${status} ${name}`]); noLeak(everything(r, warns));
    });
  }
  test("both routes fail: not sent, both reasons kept as status and error number only, nothing private in any log", async () => {
    resend = () => QUOTA; cf = () => ({ status: 400, body: { success: false, errors: [{ code: 10202, message: `sender ${OWNER} is not verified, token ${CF_TOKEN}` }] } });
    const r = await send();
    assert.deepEqual(r, { ok: false, via: "", status: "cloudflare 400 code10202; resend 429 monthly_quota_exceeded" });
    assert.equal(by("cf").length, 1); // Cloudflare is asked exactly once
    assert.deepEqual(warns, ["[mail] send_failed 429 monthly_quota_exceeded; cloudflare 400 code10202"]); noLeak(everything(r, warns));
  });
  test("Cloudflare says success:false with a 200: not counted as sent", async () => {
    resend = () => QUOTA; cf = () => ({ status: 200, body: { success: false, errors: [] } });
    assert.deepEqual(await send(), { ok: false, via: "", status: "cloudflare 200; resend 429 monthly_quota_exceeded" });
  });
  test("Cloudflare gives no answer, or answers 500: one try only, the reason is kept", async () => {
    resend = () => ({ status: 500 }); cf = () => "throw";
    assert.equal((await send()).status, "cloudflare network; resend 500");
    cf = () => ({ status: 500 }); calls = [];
    assert.equal((await send()).status, "cloudflare 500; resend 500"); assert.equal(by("cf").length, 1);
  });
  test("a provider's error name is cleaned: letters, digits, space, underscore, dash only", async () => {
    resend = () => ({ status: 403, body: { name: `x@y.z\r\nInjected: <b>${BUYER}</b>` } });
    const r = await send(); assert.match(r.status, /^refused 403 [A-Za-z0-9_ -]*$/); assert.ok(r.status.length <= "refused 403 ".length + 40); assert.ok(!r.status.includes("@"));
  });
});

describe("without BOTH secrets nothing changes: the dark state is exactly the one Resend call of before", () => {
  const bare = [["neither secret", { CF_EMAIL_TOKEN: undefined, CF_ACCOUNT_ID: undefined }], ["only the token", { CF_ACCOUNT_ID: undefined }], ["only the account id", { CF_EMAIL_TOKEN: undefined }], ["both empty", { CF_EMAIL_TOKEN: "", CF_ACCOUNT_ID: "" }],
    ["an account id that is not 32 hex characters", { CF_ACCOUNT_ID: "../../evil" }], ["an account id that is too short", { CF_ACCOUNT_ID: "abc123" }]];
  for (const [label, over] of bare) {
    test(`${label}: a 5xx is one Resend call, no retry, no Cloudflare, and the answer is 'refused'`, async () => {
      assert.equal(cfMailOf(mkEnv(over)), null);
      resend = () => ({ status: 500, body: { name: "internal_server_error", message: `oops ${OWNER}` } });
      const r = await send({}, T0, mkEnv(over));
      assert.deepEqual(r, { ok: false, via: "", status: "refused 500 internal_server_error" });
      assert.equal(calls.length, 1); assert.equal(by("cf").length, 0); assert.deepEqual(warns, []); noLeak(everything(r));
    });
  }
  test("the request is exactly the one of before: the same address, the same two headers, the same body, no time limit, no idempotency key", async () => {
    await send({}, T0, mkEnv({ CF_EMAIL_TOKEN: undefined }));
    assert.equal(calls.length, 1); const c = calls[0];
    assert.equal(c.url, RESEND_URL); assert.equal(c.method, "POST");
    assert.deepEqual(c.headers, { authorization: `Bearer ${RS_KEY}`, "content-type": "application/json" });
    assert.equal(c.signal, null); assert.deepEqual(timeouts, []);
    assert.deepEqual(c.body, { from: MSG.from, to: [TO], subject: "Daily ledger", text: "LEDGER TEXT BODY", html: "<p>LEDGER HTML BODY</p>", headers: { "Auto-Submitted": "auto-generated" } });
  });
  test("a quota answer is just a refusal: no pause is made, the next mail asks Resend again", async () => {
    const bareEnv = mkEnv({ CF_EMAIL_TOKEN: undefined }); resend = () => QUOTA;
    const r = await send({}, T0, bareEnv); assert.equal(r.status, "refused 429 monthly_quota_exceeded");
    await send({}, T0 + MIN, bareEnv); assert.equal(by("resend").length, 2); assert.equal(by("cf").length, 0);
  });
  test("no answer at all is one try and 'mail error network'", async () => {
    resend = () => "throw"; assert.deepEqual(await send({}, T0, mkEnv({ CF_ACCOUNT_ID: undefined })), { ok: false, via: "", status: "mail error network" }); assert.equal(calls.length, 1);
  });
  test("it works as before: Resend takes the mail", async () => {
    assert.deepEqual(await send({}, T0, mkEnv({ CF_ACCOUNT_ID: undefined })), { ok: true, via: "resend", status: "sent" });
  });
  test("without the Resend key nothing is sent anywhere, even when the two secrets are set", async () => {
    assert.deepEqual(await send({}, T0, mkEnv({ RESEND_API_KEY: undefined })), { ok: false, via: "", status: "no mail key" }); assert.equal(calls.length, 0);
    assert.deepEqual(await send({}, T0, mkEnv({ RESEND_API_KEY: "" })), { ok: false, via: "", status: "no mail key" }); assert.equal(calls.length, 0);
  });
});

describe("the second route's sender", () => {
  const ENABLED = /^(?:"[^"]*"|[^<>"]*?)\s*<[^<>@\s]+@(?:veridian-aios\.com|corporatetambola\.com)>$/;
  test("it is the call site's own default on a domain enabled for Cloudflare Email, never Resend's test sender or Resend's own sending subdomain", async () => {
    resend = () => QUOTA;
    await send({ from: "IT Services by Rajat Agarwal <onboarding@resend.dev>", cfFrom: "IT Services by Rajat Agarwal <receipts@veridian-aios.com>" });
    assert.equal(by("cf")[0].body.from, "IT Services by Rajat Agarwal <receipts@veridian-aios.com>"); assert.match(by("cf")[0].body.from, ENABLED);
    assert.ok(!by("cf")[0].body.from.includes("resend.dev")); assert.ok(!by("cf")[0].body.from.includes("send.veridian"));
  });
  test("BOSS can set the second route's sender with CF_MAIL_FROM; a comma in its name is quoted (a comma made Cloudflare refuse the mail once)", async () => {
    resend = () => QUOTA;
    await send({}, T0, mkEnv({ CF_MAIL_FROM: "Billing, IT Services <billing@veridian-aios.com>" }));
    assert.equal(by("cf")[0].body.from, `"Billing, IT Services" <billing@veridian-aios.com>`);
    forgetResendPause(); await send({}, T0, mkEnv({ CF_MAIL_FROM: "" })); // empty means: the call site's own default
    assert.equal(by("cf")[1].body.from, "IT Services Ledger <reports@veridian-aios.com>");
  });
  test("a name with a comma or another special character is quoted for Cloudflare, only when it needs it", () => {
    assert.equal(cfFrom("IT Services by Rajat Agarwal <receipts@veridian-aios.com>"), "IT Services by Rajat Agarwal <receipts@veridian-aios.com>");
    assert.equal(cfFrom("Tambola, Corporate <hello@x.com>"), `"Tambola, Corporate" <hello@x.com>`);
    assert.equal(cfFrom(`"Already, Quoted" <a@x.com>`), `"Already, Quoted" <a@x.com>`);
    assert.equal(cfFrom(`Say "hi" <a@x.com>`), `"Say \\"hi\\"" <a@x.com>`);
    assert.equal(cfFrom("hello@x.com"), "hello@x.com");
    for (const x of ["IT Services <a@x.com>", "Tambola, Corporate <a@x.com>", `"Already, Quoted" <a@x.com>`, `Say "hi" <a@x.com>`, `"Say \\"hi\\"" <a@x.com>`, "a@x.com"]) assert.equal(cfFrom(cfFrom(x)), cfFrom(x), `not stable for ${x}`); // quoting twice changes nothing
  });
  test("an account id that is not 32 hex characters is never put into the address", async () => {
    resend = () => QUOTA; await send({}, T0, mkEnv({ CF_ACCOUNT_ID: "../../evil" }));
    assert.equal(by("cf").length, 0); assert.ok(calls.every((c) => !c.url.includes("evil")));
  });
});

describe("privacy: only a status and an error name are ever kept", () => {
  test("whatever the providers say, the answer and the log lines hold no address, token, free text or body", async () => {
    for (const [rs, cfa] of [[QUOTA, { status: 400, body: { success: false, errors: [{ code: 10001, message: `from ${OWNER} not verified` }] } }], [{ status: 500, body: { message: BUYER } }, { status: 503, body: "boom" }], ["throw", "throw"]]) {
      forgetResendPause(); resend = () => rs; cf = () => cfa; warns = [];
      const r = await send(); noLeak(everything(r, warns)); assert.equal(r.ok, false);
    }
  });
  test("the mail itself goes only to the provider that is asked: the Cloudflare token never goes to Resend and the Resend key never goes to Cloudflare", async () => {
    resend = () => QUOTA; await send();
    assert.ok(!everything(by("resend")).includes(CF_TOKEN)); assert.ok(!everything(by("cf")).includes(RS_KEY));
  });
});

// ---- the two call sites, on the real migrations ---------------------------------------------------------------------------------------------------------------------------------------
async function makeDb() {
  const bun = typeof Bun !== "undefined";
  const raw = bun ? new (await import("bun:sqlite")).Database(":memory:") : new (await import("node:sqlite")).DatabaseSync(":memory:");
  const dir = join(ROOT, "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) raw.exec(readFileSync(join(dir, f), "utf8"));
  const prep = (sql) => (bun ? raw.query(sql) : raw.prepare(sql));
  const stmt = (sql, vals = []) => ({
    bind: (...v) => stmt(sql, v),
    run: async () => { const r = prep(sql).run(...vals); return { meta: { changes: r.changes } }; },
    all: async () => ({ results: prep(sql).all(...vals).map((x) => ({ ...x })) }),
    first: async () => { const x = prep(sql).get(...vals); return x ? { ...x } : null; },
  });
  return { db: { prepare: (s) => stmt(s), batch: async (xs) => Promise.all(xs.map((x) => x.run())) }, run: (sql, ...v) => prep(sql).run(...v), rows: (sql, ...v) => prep(sql).all(...v).map((x) => ({ ...x })) };
}
const PAY = "pay_RCPT0001", TXN = "ITS-pt_0123456789ab";

describe("the payment-test receipt (functions/_testmail.js)", () => {
  let d;
  beforeEach(async () => {
    d = await makeDb();
    d.run("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,payer_email,payer_user,amount_minor,updated_ms,captured_ms,txn_id) VALUES(?,?,'paid','payment_test','payment_test',1,?,?,100,1,?,?)", PAY, ITS_HOST, BUYER, "Asha Rao", T0, TXN);
  });
  const claim = () => d.rows("SELECT receipt_ms FROM payment WHERE rzp_payment_id=?", PAY)[0].receipt_ms;

  test("Resend out of quota: the receipt goes through Cloudflare, once, the claim stays taken, one key per receipt", async () => {
    resend = () => QUOTA;
    assert.equal(await sendTestReceipt(env, d.db, PAY, T0), "sent");
    assert.equal(claim(), T0); assert.equal(by("resend").length, 1); assert.equal(by("cf").length, 1);
    const c = by("cf")[0], m = receiptOf({ rzp_payment_id: PAY, txn_id: TXN, payer_user: "Asha Rao", amount_minor: 100, captured_ms: T0 });
    assert.equal(c.headers["idempotency-key"], `receipt-${PAY}`); assert.equal(by("resend")[0].headers["idempotency-key"], `receipt-${PAY}`);
    assert.equal(c.body.to, BUYER); assert.equal(c.body.subject, m.subject); assert.equal(c.body.text, m.text); assert.equal(c.body.html, m.html);
    assert.ok(c.body.subject.includes(TXN)); assert.equal(c.body.from, "IT Services by Rajat Agarwal <receipts@veridian-aios.com>");
    assert.equal(await sendTestReceipt(env, d.db, PAY, T0 + 5), "already"); assert.equal(by("cf").length, 1); // one receipt per payment, whichever path comes next
  });
  test("both routes fail: 'failed' and the claim is given back, so the next path (or the 30-minute comparison) tries again and then succeeds", async () => {
    resend = () => ({ status: 500 }); cf = () => ({ status: 500 });
    assert.equal(await sendTestReceipt(env, d.db, PAY, T0), "failed"); assert.equal(claim(), null);
    resend = () => OK; cf = () => CF_OK; forgetResendPause();
    assert.equal(await sendTestReceipt(env, d.db, PAY, T0 + 60 * MIN), "sent"); assert.equal(claim(), T0 + 60 * MIN);
  });
  test("MAIL_FROM is Resend's sender only: the second route keeps its own sender on an enabled domain, unless BOSS sets CF_MAIL_FROM", async () => {
    resend = () => QUOTA;
    assert.equal(await sendTestReceipt(mkEnv({ MAIL_FROM: "IT Services <hello@only-verified-at-resend.example>" }), d.db, PAY, T0), "sent");
    assert.equal(by("resend")[0].body.from, "IT Services <hello@only-verified-at-resend.example>"); assert.equal(by("cf")[0].body.from, "IT Services by Rajat Agarwal <receipts@veridian-aios.com>");
    d.run("UPDATE payment SET receipt_ms=NULL"); forgetResendPause();
    assert.equal(await sendTestReceipt(mkEnv({ CF_MAIL_FROM: "IT Services <receipts@corporatetambola.com>" }), d.db, PAY, T0 + 1), "sent");
    assert.equal(by("cf")[1].body.from, "IT Services <receipts@corporatetambola.com>");
  });
  test("a plain refusal at Resend is not sent a second way and gives the claim back", async () => {
    resend = () => ({ status: 422, body: { name: "validation_error" } });
    assert.equal(await sendTestReceipt(env, d.db, PAY, T0), "failed"); assert.equal(by("cf").length, 0); assert.equal(claim(), null);
  });
  test("a provider that throws every time (its text holds the address): 'failed', the claim is given back, and that text is not logged", async () => {
    globalThis.fetch = async () => { throw new Error("boom " + BUYER); };
    assert.equal(await sendTestReceipt(env, d.db, PAY, T0), "failed"); assert.equal(claim(), null); noLeak(everything(warns));
  });
  test("no mail key: no claim is taken and nothing is sent, even with the two secrets set", async () => {
    assert.equal(await sendTestReceipt(mkEnv({ RESEND_API_KEY: undefined }), d.db, PAY, T0), "no mail key"); assert.equal(claim(), null); assert.equal(calls.length, 0);
  });
  test("without the two secrets it is the one Resend call of before (no key, no retry, no Cloudflare)", async () => {
    resend = () => ({ status: 500 });
    assert.equal(await sendTestReceipt(mkEnv({ CF_EMAIL_TOKEN: undefined, CF_ACCOUNT_ID: undefined }), d.db, PAY, T0), "failed");
    assert.equal(calls.length, 1); assert.equal(calls[0].headers["idempotency-key"], undefined); assert.equal(claim(), null);
    resend = () => OK; assert.equal(await sendTestReceipt(mkEnv({ CF_EMAIL_TOKEN: undefined }), d.db, PAY, T0 + 1), "sent");
    assert.equal(calls[1].body.from, "IT Services by Rajat Agarwal <onboarding@resend.dev>"); assert.deepEqual(calls[1].body.to, [BUYER]);
  });
  test("tests of the games, and rows that are not paid payment tests, are not mailed from here", async () => {
    d.run("INSERT INTO payment(rzp_payment_id,site,status,product_type,plan,is_test,payer_email,amount_minor,updated_ms,captured_ms,txn_id) VALUES('pay_G1','corporate-bingo.pages.dev','paid','payment_test','payment_test',1,'g@example.com',100,1,1,'BNG-pay_1')");
    assert.equal(await sendTestReceipt(env, d.db, "pay_G1", T0), "skipped"); assert.equal(await sendTestReceipt(env, d.db, "pay_nope", T0), "skipped"); assert.equal(calls.length, 0);
  });
});

describe("the owner's ledger report (functions/api/pay/report.js)", () => {
  let d;
  beforeEach(async () => { d = await makeDb(); });
  const post = (query = "kind=daily&email=1", key = REPORT_KEY, e = env) => reportRoute({ request: new Request(`https://x/api/pay/report?${query}`, { method: "POST", headers: { "x-report-key": key } }), env: { ...e, DB: d.db, REPORT_KEY } });
  const logRow = () => d.rows("SELECT kind, emailed, email_status FROM report_log ORDER BY id DESC LIMIT 1")[0];

  test("Resend out of quota: the report reaches the owner through Cloudflare and report_log says sent_by_cloudflare", async () => {
    resend = () => QUOTA;
    const res = await post(), b = await res.json();
    assert.equal(res.status, 200); assert.equal(b.ok, true); assert.equal(b.emailed, 1); assert.equal(b.email_status, "sent_by_cloudflare");
    assert.deepEqual(logRow(), { kind: "daily", emailed: 1, email_status: "sent_by_cloudflare" });
    assert.equal(by("resend").length, 1); assert.equal(by("cf").length, 1);
    const c = by("cf")[0];
    assert.equal(c.body.to, OWNER); assert.equal(c.body.from, "IT Services Ledger <reports@veridian-aios.com>");
    assert.equal(c.body.subject, b.subject); assert.equal(c.body.text, b.markdown); assert.equal(c.body.html, b.html);
    assert.ok(c.headers["idempotency-key"].length >= 16); assert.equal(c.headers["idempotency-key"], by("resend")[0].headers["idempotency-key"]);
  });
  test("both routes fail: nothing is e-mailed, report_log says cloudflare <status>, and the log holds no address, token or body", async () => {
    resend = () => ({ status: 503 }); cf = () => ({ status: 400, body: { success: false, errors: [{ code: 10202, message: `bad sender ${OWNER}` }] } });
    const b = await (await post()).json();
    assert.equal(b.emailed, 0); assert.equal(b.email_status, "cloudflare 400 code10202; resend 503"); assert.ok(b.email_status.startsWith("cloudflare 400"));
    assert.deepEqual(logRow(), { kind: "daily", emailed: 0, email_status: "cloudflare 400 code10202; resend 503" }); noLeak(everything(logRow(), warns));
    assert.equal(by("resend").length, 3); assert.equal(by("cf").length, 1); // 3 tries at Resend, ONE at Cloudflare
  });
  test("MAIL_FROM is Resend's sender only: the report's second route keeps its own sender on an enabled domain", async () => {
    resend = () => QUOTA; await post("kind=daily&email=1", REPORT_KEY, mkEnv({ MAIL_FROM: "Ledger <ledger@only-verified-at-resend.example>" }));
    assert.equal(by("resend")[0].body.from, "Ledger <ledger@only-verified-at-resend.example>"); assert.equal(by("cf")[0].body.from, "IT Services Ledger <reports@veridian-aios.com>");
  });
  test("a plain refusal is not sent a second way and the log says refused <status> <name>", async () => {
    resend = () => ({ status: 403, body: { name: "validation_error", message: `You can only send testing emails to your own email address (${OWNER})` } });
    const b = await (await post("kind=monthly&email=1")).json();
    assert.equal(b.emailed, 0); assert.equal(b.email_status, "refused 403 validation_error"); assert.equal(by("cf").length, 0);
    assert.deepEqual(logRow(), { kind: "monthly", emailed: 0, email_status: "refused 403 validation_error" }); noLeak(everything(logRow(), b.email_status));
  });
  test("without the two secrets it is the one Resend call of before: sent, or refused <status> <name>", async () => {
    const bareEnv = mkEnv({ CF_EMAIL_TOKEN: undefined, CF_ACCOUNT_ID: undefined });
    let b = await (await post("kind=daily&email=1", REPORT_KEY, bareEnv)).json();
    assert.equal(b.emailed, 1); assert.equal(b.email_status, "sent"); assert.deepEqual(by("resend")[0].body.to, [OWNER]); assert.equal(by("resend")[0].headers["idempotency-key"], undefined);
    resend = () => ({ status: 500, body: { name: "internal_server_error" } });
    b = await (await post("kind=daily&email=1", REPORT_KEY, bareEnv)).json();
    assert.equal(b.emailed, 0); assert.equal(b.email_status, "refused 500 internal_server_error"); assert.equal(by("resend").length, 2); assert.equal(by("cf").length, 0);
  });
  test("no Resend key: 'no mail key' and nothing is sent; no email asked: 'not requested' and no mail call at all", async () => {
    const b = await (await post("kind=daily&email=1", REPORT_KEY, mkEnv({ RESEND_API_KEY: undefined }))).json();
    assert.equal(b.email_status, "no mail key"); assert.equal(b.emailed, 0); assert.equal(calls.length, 0);
    const n = await (await post("kind=daily")).json(); assert.equal(n.email_status, "not requested"); assert.equal(calls.length, 0);
  });
  test("a wrong report key is refused as before and sends nothing", async () => {
    const res = await post("kind=daily&email=1", "wrong"); assert.equal(res.status, 404); assert.equal(calls.length, 0); assert.equal(d.rows("SELECT COUNT(*) AS n FROM report_log")[0].n, 0);
  });
});

describe("one helper", () => {
  test("no file under functions/ except _mail.js calls a mail provider", () => {
    const hits = [];
    (function walk(dir) { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs|ts)$/.test(n) && /api\.resend\.com|email\/sending/.test(readFileSync(p, "utf8"))) hits.push(p.slice(ROOT.length + 1).replace(/\\/g, "/")); } })(join(ROOT, "functions"));
    assert.deepEqual(hits, ["functions/_mail.js"]);
  });
  test("both call sites import it", () => {
    for (const f of ["functions/_testmail.js", "functions/api/pay/report.js"]) assert.match(readFileSync(join(ROOT, f), "utf8"), /import \{ sendMail \} from "(?:\.\.?\/)+_mail\.js"/);
  });
});
