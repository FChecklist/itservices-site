# Changelog

IT Services site and central ledger (itservices-site). Newest first. Dates are in IST.

How to add a version: see the "Version" section in KNOWLEDGE-MAP.md. Every deployed change bumps the version, adds an entry here, and updates `static/version.json` and KNOWLEDGE-MAP.md in the same pull request.

## 0.1.0 - 21 Nov 2026

First numbered version. Nothing in the site or the payment code changed; this only gives the existing state a number so later changes can be tracked.

- The site (served from `dist/`, built by `build.py`) and the central payment ledger were already live. This version describes them as they were at commit 2a3dd8e.
- Added `static/version.json`, so the site serves `/version.json` after its next deploy. The owner console already looks for this file on every site.
- Added this changelog and a Version section in KNOWLEDGE-MAP.md.

## History before version numbers

These are the real milestones from the git history. They were not numbered at the time; they are listed here so the story is in one place. They are all part of 0.1.0.

- **14 Nov 2026** - Knowledge map added: what this repository is for and what the other repositories are for.
- **1 Nov 2026** - Corporate Lucky Draw registered in the central payment service.
- **29 Oct 2026** - Home page and footer stop advertising products; the site is generic again, with no product, price or other-site reference.
- **27 Oct 2026** - Owner console: sign-in with lock-out, numbers for all sites, one-time Rs 0 prospect links, option to make one game free, and a form to make the next game for a prospect. The payment window also accepts the housie. and console. corporatetambola.com addresses as parents.
- **22 Oct 2026** - Home page redesigned (30 years end to end, AI in existing software, owner's portrait, fewer words).
- **15 Oct 2026** - Payment frame accepts the new corporatetambola.com addresses. Owner mail now goes to the official owner address.
- **14 Oct 2026** - Rs 1 payment test, uniform footer, brighter installable site (app icons, offline page), privacy of the ledger copies. Central ledger forwards the Razorpay event id to the site; reconcile can file earlier untagged payments under their website. Footer column titles are labels, not headings.
- **13 Oct 2026** - Ledger part 2: failed attempts, bank references, disputes, settlements, owner report, site summary. Names for every site and product, reconcile endpoint. Delivery, cancellation, refund and product policies; all-rights-reserved notice.
- **12 Oct 2026** - Central payment ledger and webhook: one Razorpay webhook for every site, recorded in the D1 database and passed on to the site; owner-only ledger read. Ledger v2 with payouts, central order and verify API per site key, master ledger and tax summary views. Plan catalog, Corporate Bingo and the games still to come registered. Webhook routing for DPDP events.
- **11 Oct 2026** - Payment frame page for Corporate Tambola (the Razorpay window runs on this registered site); also serves the startup coaching page and veridian-aios.com (DPDP). Pricing lists DPDP and the coaching program.
- **10 Oct 2026** - Webhook relay for Corporate Tambola. Address and phone format added.
- **9 Oct 2026** - First version of the "IT Services by Rajat Agarwal" website with the policy pages Razorpay asks for (about, contact, privacy, terms).
