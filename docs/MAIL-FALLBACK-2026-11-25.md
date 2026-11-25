# Second mail route (Cloudflare Email), release 0.2.0, 25 Nov 2026

Status: built and tested, **dark** (switched off). Nothing here sets a secret or deploys. Mirrors corporate-tambola 1.9.2 (`apps/edge/src/pay.ts`, `resendSend`, and its `docs/MAIL-FALLBACK-2026-11-20.md`).

## Why
The Resend account is the FREE plan and is shared by every product. It answered `429 monthly_quota_exceeded` on 20 Nov 2026, so every mail sent through it was refused. Asking Resend again cannot help until its plan resets. IT Services had two places that send mail, both Resend only:
- the receipt of a Rs 1 payment test (`functions/_testmail.js`, `sendTestReceipt`);
- the owner's ledger report (`functions/api/pay/report.js`, `?email=1`).

## What the code does (`functions/_mail.js`, `sendMail`, the ONE helper both call)
1. Resend first, with ONE idempotency key for the mail. A receipt uses `receipt-<Razorpay payment id>`; a report gets a random key per call.
2. Resend answers a quota (429 and an error name that contains `quota`, for example `monthly_quota_exceeded`): it is not asked again for this mail, and not asked for ANY mail for the next 30 minutes. The mail goes to the second route at once.
3. Resend answers 429 rate limit or 5xx, or does not answer within 4 seconds: it is asked again, up to 3 tries in all (it waits `MAIL_RETRY_MS` = 800 ms after the first try, 1,600 ms after the second).
4. When Resend did not take the mail AND the two Pages secrets `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID` are both set, the same mail goes ONCE through Cloudflare Email Service (`POST https://api.cloudflare.com/client/v4/accounts/<CF_ACCOUNT_ID>/email/sending/send`) with the same idempotency key header. The sender is on a domain that is enabled for Cloudflare Email (see "Sender" below). The account limit is 200 mails a day.
5. A plain refusal from Resend (4xx other than 429, for example a bad address) is never repeated and never sent a second way.
6. **Without the two secrets the behaviour is exactly what it was before**: one Resend call, no retry, no time limit, no idempotency key, no pause, no second route; same address, same two headers, same body (a test checks this request field by field). Without `RESEND_API_KEY` nothing is sent anywhere, as before.
7. What is kept is a status and an error NAME only, never an address, a token or a body:
   - `report_log.email_status`: `sent` | `sent_by_cloudflare` | `no mail key` | `refused <status> <name>` | `cloudflare <status>[ code<n>]; resend <why>` (both routes failed) | `not requested`. `<n>` is Cloudflare's numeric error code.
   - when the second route was involved, one `console.warn` line of the same words (`[mail] resend_failed 429 monthly_quota_exceeded; sent_by_cloudflare`).
   - The old text `refused <status> <the first 160 characters of what Resend said>` is gone: Resend's own sentence can hold an address (its test-sender refusal names the account owner's address). This is the one visible change in the dark state, and it is a smaller log line, not a different behaviour.
   - A receipt that could not be sent still gives its claim back (`payment.receipt_ms` goes back to empty), so the next path or the 30-minute comparison with Razorpay sends it.

## Settings: set by BOSS on the Pages project `itservices-rajat-agarwal`, then redeploy
This change does not set any of them. Until the first two are set, the second route is off.

| Name | Kind | What |
|---|---|---|
| `CF_EMAIL_TOKEN` | Pages secret | The Cloudflare Email sending key (the dashboard key `dpdp-email-sending`, the same value other products call `CLOUDFLARE_EMAIL_TOKEN`). |
| `CF_ACCOUNT_ID` | Pages secret | The Cloudflare account id: exactly 32 hexadecimal characters (anything else is ignored, because it becomes part of the address that is called). |
| `CF_MAIL_FROM` | Pages variable, optional | The sender on the second route, `Name <address>`, on a domain that is enabled for Cloudflare Email. Without it the sender is `IT Services by Rajat Agarwal <receipts@veridian-aios.com>` (receipts) and `IT Services Ledger <reports@veridian-aios.com>` (report). |
| `MAIL_RETRY_MS` | Pages variable, optional | Wait between Resend tries, default 800. |
| `RESEND_API_KEY`, `MAIL_FROM` | existing | Unchanged. `MAIL_FROM` is still the sender on Resend only. |

Before the switch-on, BOSS checks:
1. **Sender domain.** `veridian-aios.com` must show *Enabled* in the Cloudflare Email dashboard (it did on 12 Nov 2026), or `CF_MAIL_FROM` must name an address on a domain that does (for example `corporatetambola.com`). A sender on a domain that is not enabled makes Cloudflare refuse the mail (`cloudflare 400 code...` in the log); nothing worse happens.
2. **Privacy page.** The page lists Cloudflare as the website's hosting provider only ("To host and protect this website and our services") and Resend as the sender of e-mail. Once the second route is on, Cloudflare also sends mail (receipts and reports). The wording of that page is the owner's decision; it is NOT changed here.
3. **Set the two secrets, redeploy.** Then the first time Resend answers a quota, `report_log.email_status` shows `sent_by_cloudflare`. (There is no way to see the second route work on the live site without Resend failing: without a Resend key nothing is sent, and a wrong key is a plain refusal, which is never re-routed.)

## Limits (honest)
- **The 30-minute pause is memory of one running copy (isolate) of the site, not a shared record.** There is no table for it, so no database change is needed. A new copy asks Resend once, gets the same quota answer, and remembers it. The cost is one extra call to Resend now and then.
- **Possible second copy of a mail.** When Resend answers a 5xx or nothing at all, it may have taken the mail anyway; the Cloudflare copy would then be a second mail. The same key is sent to both, but how Cloudflare handles that header is not documented. A quota answer, the real cause, is definite.
- **A 4xx is never re-routed**, including a wrong or missing Resend key (401/403) and the Resend test sender `onboarding@resend.dev` (it may only mail the account owner). Both are configuration problems the second route should not hide.
- **Shared allowance.** The 200 mails a day belong to the whole Cloudflare account (marketing mail through `tia@` uses it too). If that allowance is used up, the second route is closed as well. A separate allowance for transactional mail is an owner decision.
- **Time.** The receipt is sent while Razorpay's webhook or the buyer's confirmation is waiting. In the worst case with the second route on (Resend silent), one receipt can take about 18 seconds (3 tries of 4 seconds, 2.4 seconds of waiting, 4 seconds at Cloudflare). A receipt that fails gives its claim back and the 30-minute comparison sends it. The normal quota case takes two quick calls.
- **Not covered.** The games send their own mail from their own repositories. No other place in this repository sends mail (a test fails if a second one appears).
- **Test sender.** `onboarding@resend.dev` stays the Resend default for receipts when `MAIL_FROM` is not set, as before.

## Tests
`test/mail-fallback.test.js`, 54 tests. They run under both runners: `node --test test/mail-fallback.test.js` and `bun test test/mail-fallback.test.js` (the receipt and report tests build the real migrations in an in-memory SQLite). They cover: quota goes to Cloudflare once with one key; the 30-minute pause and its two edges; 5xx and no answer retried 3 times then Cloudflare once; no double send when a later try succeeds; every 4xx refused and not re-routed; both routes failing; no secrets (6 shapes, including a bad account id) changes nothing, down to the request; no Resend key sends nothing; the sender; nothing private in any status or log line; the receipt and report paths; and that only `_mail.js` calls a mail provider.
