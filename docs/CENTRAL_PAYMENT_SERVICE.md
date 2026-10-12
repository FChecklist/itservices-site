# Central payment service and ledger: IT Services by Rajat Agarwal

Owner order 2026-10-12: ONE Razorpay ledger for income tax. Every rupee in or out is a line in the template

    razorpay / IT Services / <website> / <stream> / <plan>

streams: `sales` (money in) | `refer_and_earn` | `sales_team_commission` | `sales_team_salary` (money out).
A new website, product or plan is only new rows (`site`, `plan_catalog`), never new code paths.

## Where it lives
- Cloudflare Pages project `itservices-rajat-agarwal`, D1 `itservices-payments` (id a41c7b07-9536-4e95-b7a1-d41ef8e57384), free plan.
- Schema: `migrations/0001..0003` (tables `site`, `product_catalog`, `plan_catalog`, `stream`, `pay_order`, `payment`, `payout`, `webhook_log`; views `payment_ledger`, `master_ledger`, `tax_summary`).
- Secrets (Pages): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `LEDGER_KEY` (owner read key, copy in the git-ignored `.ledger-key.txt`). Per-website keys: git-ignored `.site-keys.json`; only their sha256 is in D1 (`site.key_hash`).

## API
| Call | Who | What |
|---|---|---|
| `POST /api/pay/order` | website (`x-site-key`) | opens ONE Razorpay order tagged site / sales / product / plan; body `{site, product, plan, amount_minor, currency, payment_ref, user?, payer_email?, payer_phone?, extra_notes?}` |
| `POST /api/pay/verify` | website | checks the checkout signature, asks Razorpay what happened, captures if only authorized, records the payment, answers the facts |
| `POST /api/pay/webhook` (and old `/corporate-tambola`) | Razorpay | checks signature, logs the call, records the payment, passes the untouched message to the site's own webhook |
| `POST /api/pay/payout` | website (create planned) / owner (approve, mark paid) | money OUT; a payout is `paid` only with a real Razorpay payout id or bank reference. This service records payouts, it never moves money |
| `GET /api/pay/ledger?view=master\|tax\|payments\|payouts\|webhooks&site=&stream=&plan=&financial_year=&format=csv` | owner (`Bearer LEDGER_KEY`) | the ledger |
| `GET /api/pay/ping` | anyone | liveness |

## Website integration (done 2026-10-12)
Each site opens its order through `POST /api/pay/order` and reports a verified payment to `POST /api/pay/verify`. Each keeps its own fulfilment (Tambola: entitlements and invoices; coach: e-mails; DPDP: booking the org). If the central service is unreachable (or the site has no key), the site opens the order directly with Razorpay as before, with the same `site`/`stream`/`plan` notes, so the webhook still files it in the ledger.
- Corporate Tambola: `apps/edge/src/pay.ts` (`placeOrder`, `reportToCentral`); secret `PAY_SERVICE_KEY`. Plans `pack_N`, `payment_test`.
- Startup coach: `functions/api/checkout.js`, `verify.js`; secret `PAY_SERVICE_KEY`. Plans `startups_N`.
- Veridian DPDP: `supabase/functions/dpdp-pay` (`buildCentralOrderBody`); Supabase secret `PAY_SERVICE_KEY`. Plan = the variation (`<plan>_<interval>`).

## Not done yet
- Razorpay (Live) webhook URL still points to the old address. Owner step: set it to `https://itservices-rajat-agarwal.pages.dev/api/pay/webhook`, Secret = `RAZORPAY_WEBHOOK_SECRET` from `C:\ct\ct\.env.local`.
- Invoices are still issued by each site (Tambola has its own numbering series). A central invoice series is the one part of "Stage 3" not moved.
- Payout execution (RazorpayX) is not connected; payouts are recorded by hand (owner key).
- Refer-and-earn tier rules: concept only, awaiting the owner's decisions.
