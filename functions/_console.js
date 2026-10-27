// The owner's private console: sign-in, lock-out, session cookie. Only ONE person can ever sign in (CONSOLE_EMAIL) with a passcode that is never stored in clear:
// the Pages secret CONSOLE_PASS_MAC is HMAC-SHA256(CONSOLE_KEY, "pass:" + passcode). Five wrong tries (in any mix of addresses) lock the sign-in for one hour, even for the right passcode.
import { hmacHex, same, json } from "./_lib.js";

export const MAX_TRIES = 5, LOCK_MS = 3600_000, SESSION_MS = 8 * 3600_000, COOKIE = "ctc";
export const OWNER_EMAIL_DEFAULT = "raajat.agarwal@gmail.com";

let made = false;
/** The deploy key cannot run migrations on the live ledger, so the small table is created here on first use (the same SQL as migrations/0013_console.sql). */
async function ensureTable(db) {
  if (made) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS console_attempt (id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER NOT NULL, ok INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS console_attempt_at ON console_attempt (at_ms)").run();
  made = true;
}
export async function lockedUntil(db, now) {
  await ensureTable(db);
  const rows = (await db.prepare("SELECT at_ms FROM console_attempt WHERE ok=0 AND at_ms>? ORDER BY at_ms DESC LIMIT ?").bind(now - LOCK_MS, MAX_TRIES).all()).results ?? [];
  return rows.length >= MAX_TRIES ? rows[0].at_ms + LOCK_MS : 0;
}
async function note(db, now, ok) {
  await db.prepare("INSERT INTO console_attempt(at_ms,ok) VALUES(?,?)").bind(now, ok ? 1 : 0).run();
  await db.prepare("DELETE FROM console_attempt WHERE at_ms<?").bind(now - 7 * 86400_000).run();
}
export async function signIn(env, now, email, passcode) {
  if (!env.DB || !env.CONSOLE_KEY || !env.CONSOLE_PASS_MAC) return { status: 404, body: { error: "Not found" } };
  const until = await lockedUntil(env.DB, now);
  if (until) return { status: 429, body: { error: "Too many wrong tries. Locked.", minutes: Math.ceil((until - now) / 60000) } };
  const mac = await hmacHex(env.CONSOLE_KEY, "pass:" + String(passcode ?? "").slice(0, 64));
  const mailOk = same(String(email ?? "").trim().toLowerCase(), (env.CONSOLE_EMAIL || OWNER_EMAIL_DEFAULT).toLowerCase());
  const passOk = same(mac, env.CONSOLE_PASS_MAC);
  const ok = mailOk && passOk; // both are always computed: the answer never says which one was wrong
  await note(env.DB, now, ok);
  if (!ok) return { status: 401, body: { error: "Wrong e-mail or passcode." } };
  const exp = now + SESSION_MS;
  return { status: 200, body: { ok: true }, cookie: `${COOKIE}=${exp}.${await hmacHex(env.CONSOLE_KEY, "sess:" + exp)}; Max-Age=${SESSION_MS / 1000}; Path=/api/console; HttpOnly; Secure; SameSite=Strict` };
}
export async function signedIn(request, env, now) {
  if (!env.CONSOLE_KEY) return false;
  const m = /(?:^|;\s*)ctc=(\d{10,16})\.([0-9a-f]{64})/.exec(request.headers.get("cookie") ?? "");
  if (!m || Number(m[1]) < now) return false;
  return same(await hmacHex(env.CONSOLE_KEY, "sess:" + m[1]), m[2]);
}
export const reply = (o, status = 200, cookie) => { const r = json(o, status); r.headers.set("cache-control", "no-store"); r.headers.set("x-robots-tag", "noindex"); if (cookie) r.headers.append("set-cookie", cookie); return r; };
