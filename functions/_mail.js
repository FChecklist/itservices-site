// IT Services mail: the ONE place that sends it. The Rs 1 payment-test receipt (_testmail.js) and the owner's ledger report (api/pay/report.js) both call sendMail from here.
// Why: the Resend account is shared by every product and its monthly quota ran out on 20 Nov 2026 ("429 monthly_quota_exceeded"); a second route is the cure.
// Owner decision 17 Nov 2026: Cloudflare Email is the default second route. Mirrors corporate-tambola 1.9.2 (resendSend there; its docs/MAIL-FALLBACK-2026-11-20.md).
//
// SHIPPED DARK. Without BOTH Pages secrets CF_EMAIL_TOKEN and CF_ACCOUNT_ID this is exactly the single Resend call of before: one try, no time limit, no idempotency key,
// no pause, no second route. With both set:
//   1. Resend first, with ONE idempotency key for the mail; the same key goes to Cloudflare.
//   2. Resend answers a quota (429 and an error name that contains "quota"): not asked again for this mail, and not asked for ANY mail for the next 30 minutes.
//   3. Resend answers 429 rate limit or 5xx, or does not answer within 4 seconds: asked again, up to 3 tries in all.
//   4. When Resend did not take the mail, the SAME mail goes ONCE through Cloudflare Email Service (sender on a domain enabled for it; the account limit is 200 mails a day).
//   5. A plain refusal (any other 4xx, for example a bad address) is never repeated and never sent a second way.
// What is reported is the provider's status and error NAME only, never an address, a token or a body: sendMail answers `status` for the caller's own log (report_log.email_status),
// and when the second route was involved it also writes one console.warn line of the same words. Plan, settings and limits: docs/MAIL-FALLBACK-2026-11-25.md.

const RESEND_URL = "https://api.resend.com/emails";
const cfUrl = (account) => `https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`;
/** One call to a provider gives up after this long, so one stuck provider cannot hold a webhook or the reconcile run. (Second route only; the first-route-only mode never had a limit.) */
export const MAIL_FETCH_MS = 4000;
/** Tries at Resend for one mail, the first included. */
export const MAIL_TRIES = 3;
/** After Resend answers "quota used up" it is not asked again for this long. */
export const RESEND_PAUSE_MS = 30 * 60_000;
/** This isolate's memory of that answer. It is not shared between isolates and not kept anywhere: a new isolate asks Resend once, gets the same quota answer, and remembers it. */
let resendPausedUntil = 0;
/** Tests only: forget the pause. */
export const forgetResendPause = () => { resendPausedUntil = 0; };

/** The second route, or null. Both values are Pages secrets; the account id must be 32 hex characters because it becomes part of the address that is called. */
export const cfMailOf = (env) => (env.CF_EMAIL_TOKEN && env.CF_ACCOUNT_ID && /^[0-9a-f]{32}$/i.test(String(env.CF_ACCOUNT_ID)) ? { token: String(env.CF_EMAIL_TOKEN), account: String(env.CF_ACCOUNT_ID) } : null);

/** "Name <addr>" with a comma or another special character in the name must be quoted for Cloudflare (a comma in the name once made it refuse every mail with code 10202). */
export const cfFrom = (from) => {
  const m = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(String(from));
  if (!m || !m[1]) return String(from);
  const q = /^"(.*)"$/s.exec(m[1]), n = q ? q[1].replace(/\\(["\\])/g, "$1") : m[1]; // a name that is already quoted is opened first, so it is never quoted twice
  return /[",;:<>@()[\]\\]/.test(n) ? `"${n.replace(/(["\\])/g, "\\$1")}" <${m[2]}>` : `${n} <${m[2]}>`;
};
/** The sender on the second route: CF_MAIL_FROM when BOSS sets it, else the call site's own default on a domain that is enabled for Cloudflare Email. Never Resend's test sender. */
const cfSender = (env, m) => cfFrom(env.CF_MAIL_FROM || m.cfFrom || m.from);

/** The provider's error NAME (for example "monthly_quota_exceeded"), cleaned to letters, digits, space, underscore and dash. Never its free text, which can hold an address. */
const nameOf = async (r) => { try { const j = await r.json(); return String(j?.name ?? "").replace(/[^A-Za-z0-9_ -]/g, "").slice(0, 40); } catch { return ""; } };
const whyOf = (status, name) => `${status}${name ? " " + name : ""}`;
const keyOf = (idem) => String(idem || crypto.randomUUID()).replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 250) || crypto.randomUUID();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const note = (text) => console.warn("[mail] " + text);
const resendBody = (m) => JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), headers: { "Auto-Submitted": "auto-generated" } });

/** The mode without the second route: exactly the one call of before (no retry, no time limit, no idempotency key). */
async function sendOnlyResend(env, m) {
  try {
    const r = await fetch(RESEND_URL, { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: resendBody(m) });
    return r.ok ? { ok: true, via: "resend", status: "sent" } : { ok: false, via: "", status: "refused " + whyOf(r.status, await nameOf(r)) };
  } catch { return { ok: false, via: "", status: "mail error network" }; }
}

/** One try at Resend with the mail's idempotency key. `again`: worth asking Resend again. `quota`: its quota is used up, asking again cannot help until its plan resets. */
async function resendAttempt(env, key, m) {
  try {
    const r = await fetch(RESEND_URL, { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", "idempotency-key": key }, signal: AbortSignal.timeout(MAIL_FETCH_MS), body: resendBody(m) });
    if (r.ok) return { ok: true };
    const name = await nameOf(r), quota = r.status === 429 && /quota/i.test(name); // "daily_quota_exceeded" / "monthly_quota_exceeded"
    return { ok: false, why: whyOf(r.status, name), quota, again: !quota && (r.status === 429 || r.status >= 500) };
  } catch { return { ok: false, why: "network", quota: false, again: true }; }
}

/** The same mail through Cloudflare Email Service. On failure the reason is the HTTP status and Cloudflare's numeric error code only, never its message. */
async function cloudflareSend(env, cf, key, m) {
  try {
    const r = await fetch(cfUrl(cf.account), { method: "POST", headers: { authorization: `Bearer ${cf.token}`, "content-type": "application/json", "idempotency-key": key }, signal: AbortSignal.timeout(MAIL_FETCH_MS),
      body: JSON.stringify({ from: cfSender(env, m), to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }) });
    let j = null; try { j = await r.json(); } catch { /* no body */ }
    if (r.ok && j?.success !== false) return { ok: true, why: "" };
    const code = Number(j?.errors?.[0]?.code);
    return { ok: false, why: `${r.status}${Number.isInteger(code) && code > 0 ? " code" + code : ""}` };
  } catch { return { ok: false, why: "network" }; }
}

/**
 * Sends ONE mail. `m` = { from, to, subject, text, html?, cfFrom?, idem? }: `from` is the Resend sender (the call site's own choice, as before), `cfFrom` the call site's default sender for the
 * second route (a domain enabled for Cloudflare Email), `idem` a key that stays the same for the same mail (a random one is made when it is missing). `now` is only for the 30-minute pause.
 * Answers { ok, via: "resend" | "cloudflare" | "", status }. Never throws. `status` is the text for the caller's log:
 *   "sent" | "sent_by_cloudflare" | "no mail key" | "refused <status> <name>" | "mail error network" (first route only) | "cloudflare <status>[ code<n>]; resend <why>" (both routes failed).
 */
export async function sendMail(env, m, now = Date.now()) {
  if (!env.RESEND_API_KEY) return { ok: false, via: "", status: "no mail key" }; // as before: without the Resend key nothing is sent anywhere (local and test runs stay quiet)
  const cf = cfMailOf(env);
  if (!cf) return sendOnlyResend(env, m); // dark: the second route is not set up, so nothing else changes
  const key = keyOf(m.idem), waitMs = Math.min(Number(env.MAIL_RETRY_MS ?? 800) || 0, 5000);
  let why = "network", refused = false;
  if (resendPausedUntil > now) why = "429 quota (paused)";
  else for (let attempt = 0; attempt < MAIL_TRIES; attempt++) {
    const r = await resendAttempt(env, key, m);
    if (r.ok) return { ok: true, via: "resend", status: "sent" };
    why = r.why; refused = !r.again && !r.quota;
    if (r.quota) resendPausedUntil = now + RESEND_PAUSE_MS;
    if (!r.again) break; // a refusal, or a used-up quota: asking Resend again cannot help
    if (attempt < MAIL_TRIES - 1 && waitMs > 0) await sleep(waitMs * (attempt + 1));
  }
  if (refused) { note(`send_failed ${why}`); return { ok: false, via: "", status: `refused ${why}` }; } // a plain refusal is never sent a second way
  const c = await cloudflareSend(env, cf, key, m);
  if (c.ok) { note(`resend_failed ${why}; sent_by_cloudflare`); return { ok: true, via: "cloudflare", status: "sent_by_cloudflare" }; }
  note(`send_failed ${why}; cloudflare ${c.why}`);
  return { ok: false, via: "", status: `cloudflare ${c.why}; resend ${why}` };
}
