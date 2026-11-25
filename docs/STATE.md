# IT Services: state (Moneypenny credit orders)
suiteRulesVersion: 1.1
Branch feat/credit-order-moneypenny. credit-order / credit-verify (Moneypenny key only), credit_outbox push, migration 0015. NOT deployed.
Refund and dead-push procedure: docs/REFUNDS.md. Needs owner and deploy checklist: see Moneypenny STATE.md "Game pay chain".

## Version (this repository)
- Current version: **0.2.0** (MAJOR.MINOR.PATCH). History is in `CHANGELOG.md`. Master numbers its own state 0.1.0 (pull request 2); this tree is ahead of master.
- `static/version.json` holds the version, release time (UTC and IST), commit and the list of changes. `build.py` copies everything in `static/` to the site root, so the live site serves it at `/version.json` after a deploy.
- Every deployed change bumps the version. In the same pull request: bump MAJOR.MINOR.PATCH, add a new entry at the top of `CHANGELOG.md`, update `static/version.json` (version, releasedAt, releasedAtIST, commit, and a new item at the top of `changes`), and update this section. PATCH for fixes and wording, MINOR for new features, MAJOR for breaking changes.
- The `commit` field is the commit the release is built from; it cannot hold the hash of the commit that carries it, so use the commit just before the release commit.

## Mail (0.2.0, switched off)
Resend first; a second route through Cloudflare Email only after BOSS sets `CF_EMAIL_TOKEN` and `CF_ACCOUNT_ID` on the Pages project and redeploys. One helper, `functions/_mail.js`. Plan, settings and limits: `docs/MAIL-FALLBACK-2026-11-25.md`.
