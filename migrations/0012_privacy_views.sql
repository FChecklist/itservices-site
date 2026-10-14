-- Privacy (14 Oct 2026, data audit items 1 and 6). The nightly copy of the central ledger to the private GitHub repository (views payments, master, webhooks)
-- must carry no payer contact data and no raw payment message. Safe to repeat (DROP VIEW IF EXISTS / CREATE VIEW only; no table changes).
--   payment_ledger     (view=payments)  no payer name, e-mail or mobile any more.
--   master_ledger_safe (view=master)    the master ledger without the payer's e-mail and name on money-in lines (money-out lines keep the payee, a business partner).
--   webhook_log_safe   (view=webhooks)  ids, event, result: never raw_body or raw_sig.
--   payment_contact    (view=payments_contact, owner reads only, NOT in the backup) who paid, for answering a payer's question.
DROP VIEW IF EXISTS payment_ledger;
CREATE VIEW payment_ledger AS SELECT p.rzp_payment_id, p.rzp_order_id, p.txn_id, p.site, s.name AS site_name, p.product, c.name AS product_name, p.product_type, p.product_ref, p.site_payment_ref, p.currency, p.amount_minor/100.0 AS amount, p.method, p.status, p.is_international, p.is_test, p.test_from, datetime(p.created_ms/1000,'unixepoch') AS created_utc, datetime(p.captured_ms/1000,'unixepoch') AS captured_utc, (SELECT group_concat(w.event||':'||w.outcome||'/'||COALESCE(w.forward_status,'-'),', ') FROM webhook_log w WHERE w.rzp_payment_id=p.rzp_payment_id AND w.signature_ok=1) AS webhook_events FROM payment p LEFT JOIN site s ON s.host=p.site LEFT JOIN product_catalog c ON c.product=p.product AND c.product_type=p.product_type;
DROP VIEW IF EXISTS payment_contact;
CREATE VIEW payment_contact AS SELECT p.rzp_payment_id, p.txn_id, p.site, p.status, p.payer_user, p.payer_email, p.payer_phone, p.created_ms FROM payment p;
DROP VIEW IF EXISTS webhook_log_safe;
CREATE VIEW webhook_log_safe AS SELECT id, received_ms, event, rzp_event_id, rzp_order_id, rzp_payment_id, site, amount_minor, signature_ok, outcome, forward_status FROM webhook_log;
DROP VIEW IF EXISTS master_ledger_safe;
CREATE VIEW master_ledger_safe AS SELECT ledger_path, direction, site, stream, plan, product, product_type, CASE WHEN direction='in' THEN NULL ELSE party END AS party, CASE WHEN direction='in' THEN NULL ELSE party_ref END AS party_ref, currency, amount, signed_amount, tds, razorpay_ref, site_ref, status, method, date_ms, date_utc, financial_year FROM master_ledger;
