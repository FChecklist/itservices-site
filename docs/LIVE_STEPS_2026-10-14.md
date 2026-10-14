# Live steps for the central ledger (written 14 Oct 2026; NOTHING here has been run)

Each step changes the live D1 `itservices-payments` or the live website. Run them in this order, only when the owner says go. Use `C:\ct\games-ops\mig_all.py` for migration files and `d1apply.py` for the purge file.

1. Apply `migrations/0011_payment_test.sql` (payment tests: `is_test`, receipt claim, views). Its ALTERs run once; `mig_all.py` tolerates "duplicate column".
2. Apply `migrations/0012_privacy_views.sql` (the nightly-copy views carry no payer name, e-mail, mobile or raw message; `view=payments_contact` is for live reads only). Safe to repeat.
3. Purge of the raw Razorpay messages already stored in `webhook_log` (the audit counted 32 rows: whole payloads with e-mail, mobile and UPI ids). Run AFTER step 2 and after the new code is deployed, so that no new raw row is written:

```sql
-- how many rows are affected (read-only)
SELECT COUNT(*) AS rows_with_raw FROM webhook_log WHERE raw_body IS NOT NULL OR raw_sig IS NOT NULL;
-- the purge: keeps the row (ids, event, result), removes the message and the signature text
UPDATE webhook_log SET raw_body = NULL, raw_sig = NULL WHERE raw_body IS NOT NULL OR raw_sig IS NOT NULL;
-- proof (must answer 0)
SELECT COUNT(*) AS still_raw FROM webhook_log WHERE raw_body IS NOT NULL OR raw_sig IS NOT NULL;
```

4. Deploy the website (`python build.py`, then the deploy script of the PM). Order matters: steps 1 and 2 before the deploy, because the new code reads `is_test`.
5. To settle with Rajat (not code): the private repository `FChecklist/ledger-reports` keeps every night's copy in its git history, including the days before step 2 (payer e-mail and mobile, raw messages). The repository is private; leaving the history as it is is acceptable, or the history can be rewritten once. New copies after step 2 are clean.
6. The retention job (`POST /api/pay/retention`, `functions/_retention.js`; it removes ONLY orders opened and never paid, after 30 days, and never touches payments, invoices or ledger rows) is NOT switched on and is not scheduled. To switch it on later: set the Pages secret `RETENTION_LIVE=1`, add a daily call with `?apply=1` to the scheduler (header `x-reconcile-key`). Without the secret it only counts (dry run). Run a dry run first and read the counts.
