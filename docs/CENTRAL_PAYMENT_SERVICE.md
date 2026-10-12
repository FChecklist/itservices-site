# Central payment service and ledger: IT Services by Rajat Agarwal

Owner order 2026-10-12: one payment ledger for every product and website (Corporate Tambola, veridian-aios.com, startup coach, later ones). It lives in IT Services by Rajat Agarwal, the website registered with Razorpay.

## Where it lives
- Cloudflare Pages project `itservices-rajat-agarwal`, D1 database `itservices-payments` (id a41c7b07-9536-4e95-b7a1-d41ef8e57384), free plan.
- Schema: `migrations/0001_central_ledger.sql` (tables `site`, `product_catalog`, `payment`, `webhook_log`; view `payment_ledger`).

## Stage 1 (DONE 2026-10-12): central webhook + ledger
- One Razorpay webhook address for everything: `https://itservices-rajat-agarwal.pages.dev/api/pay/webhook` (the old `/corporate-tambola` path behaves the same).
- It checks Razorpay's signature with `RAZORPAY_WEBHOOK_SECRET` (Pages secret), writes the call to `webhook_log` and the payment to `payment`, then passes the untouched message to the site's own webhook (`site.webhook_url`). The site still checks the signature itself.
- Which site/product a payment belongs to is read from the Razorpay order notes: `site` (host), `product`, `variation`, `payment_ref`, optional `user`. Falls back to the product's site in `product_catalog`, then to Corporate Tambola.
- Read the ledger: `GET /api/pay/ledger?site=&product=&product_type=&status=&format=csv` with `Authorization: Bearer <LEDGER_KEY>` (key kept in the git-ignored `.ledger-key.txt` and as a Pages secret).
- Nothing about orders, verification, invoices or fulfilment moved yet: each site still creates its own orders with the same Razorpay account.

## Stage 2 (NEXT): sites use one order format
Every site must put `site`, `product`, `variation`, `payment_ref` (and `user` when known) in its Razorpay order notes. Tambola already sends product, variation, payment_ref; add `site`. DPDP (veridian-aios.com) and the startup coach need the same four notes. Add each new product as one `product_catalog` row.

## Stage 3: orders and invoices centrally
IT Services creates the orders and issues the invoices (one numbering series per brand and financial year), then calls the site's callback to fulfil. Tambola's `fulfil()` in `apps/edge/src/pay.ts` is the part that stays with Tambola (entitlements, publishing, credit); everything above it (order, verify, webhook, invoice, mail) moves. Do one site at a time, the coach site first (no real sales yet), Tambola last.

## Owner steps
- In Razorpay (Live) Webhooks, set the URL to `https://itservices-rajat-agarwal.pages.dev/api/pay/webhook` and the Secret to the value of `RAZORPAY_WEBHOOK_SECRET` in `C:\ct\ct\.env.local`, same events as now.
