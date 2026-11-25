# Changelog
IT Services site and central ledger (itservices-site). Newest first. Dates are in IST.
How to add a version: see the "Version" section in docs/STATE.md. Every deployed change bumps the version, adds an entry here, and updates `static/version.json` and docs/STATE.md in the same pull request.
## 0.2.0 - 25 Nov 2026
A second way to send mail, built but switched off. Not deployed.
- New `functions/_mail.js`: the one place that sends mail. The receipt of a payment test and the owner's ledger report both use it.
- Resend is still tried first. If Resend says its quota is used up, the next 30 minutes of mail skip Resend. If Resend is busy (429 rate limit, 5xx) or does not answer, it is tried up to 3 times. A plain refusal (a bad address) is never repeated and never sent another way.
- When Resend did not take the mail and BOSS has set `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID` on the Pages project, the same mail goes once through Cloudflare Email, with the same idempotency key.
- Without those two settings nothing changes: one Resend call, as before. Nothing sets them and nothing was deployed.
- `report_log.email_status` now says `sent_by_cloudflare` or `cloudflare <status>`; only a status and an error name are kept, never an address or a body.
- 54 new tests (`test/mail-fallback.test.js`, run with `node --test` or `bun test`). Plan, settings and limits: `docs/MAIL-FALLBACK-2026-11-25.md`.
- Numbering: master numbers its own state 0.1.0 (pull request 2, not merged). This tree is ahead of master, so its first numbered version is 0.2.0.
## History before version numbers (this tree only)
Real milestones from the git history, listed so the story is in one place. They are all part of 0.2.0.
- **20 Nov 2026** - Moneypenny credit orders: credit-order and credit-verify (Moneypenny key only), a signed push of each paid credit order once per payment, retried until Moneypenny takes it; refunded or disputed payments are never pushed. Refund and dead-push procedure and suite rules 1.1 (docs).
- **3 Nov 2026** - Private visitor dashboard for all websites (page, API, CSV, journey view); the owner dashboard reads the isolated site from its own database. Pay-frame allow-list gains the luckydraw.corporatetambola.com and rajatsir.com origins.
- **2 Nov 2026** - Game ID in the ledger: order field and Razorpay note, filled at verify and by the webhook.
- **1 Nov 2026** - No city, state or street address anywhere; a test fails if place words appear in the published files.
- Older history before 1 Nov 2026 is in the CHANGELOG of master once pull request 2 is merged.
