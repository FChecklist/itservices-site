-- B ledger, part 2 (owner order 2026-10-13): failed attempts with their reasons, bank references, our txn_id, disputes, settlements, one-time processing of each webhook event. ALTERs run once.
-- txn_id = <SITE>-<the website's own payment id>; the same text is in Razorpay's order notes (A), here (B) and in the website (C).
ALTER TABLE payment ADD COLUMN txn_id TEXT;
ALTER TABLE payment ADD COLUMN authorized_ms INTEGER;
ALTER TABLE payment ADD COLUMN failed_ms INTEGER;
ALTER TABLE payment ADD COLUMN bank TEXT;
ALTER TABLE payment ADD COLUMN wallet TEXT;
ALTER TABLE payment ADD COLUMN card_network TEXT;
ALTER TABLE payment ADD COLUMN card_type TEXT;
ALTER TABLE payment ADD COLUMN card_last4 TEXT;
ALTER TABLE payment ADD COLUMN card_issuer TEXT;
ALTER TABLE payment ADD COLUMN vpa_masked TEXT;
ALTER TABLE payment ADD COLUMN rrn TEXT;
ALTER TABLE payment ADD COLUMN acquirer_json TEXT;
ALTER TABLE payment ADD COLUMN error_code TEXT;
ALTER TABLE payment ADD COLUMN error_description TEXT;
ALTER TABLE payment ADD COLUMN error_source TEXT;
ALTER TABLE payment ADD COLUMN error_step TEXT;
ALTER TABLE payment ADD COLUMN error_reason TEXT;
ALTER TABLE payment ADD COLUMN settlement_utr TEXT;
ALTER TABLE payment ADD COLUMN settled_ms INTEGER;
ALTER TABLE pay_order ADD COLUMN txn_id TEXT;
CREATE INDEX IF NOT EXISTS payment_txn ON payment (txn_id);
CREATE INDEX IF NOT EXISTS pay_order_txn ON pay_order (txn_id);
CREATE TABLE IF NOT EXISTS event_seen (rzp_event_id TEXT PRIMARY KEY, first_ms INTEGER NOT NULL, event TEXT, site TEXT);
CREATE TABLE IF NOT EXISTS dispute (rzp_dispute_id TEXT PRIMARY KEY, rzp_payment_id TEXT NOT NULL, site TEXT, currency TEXT, amount_minor INTEGER NOT NULL, amount_deducted_minor INTEGER NOT NULL DEFAULT 0, reason_code TEXT, reason_description TEXT, phase TEXT, status TEXT, respond_by_ms INTEGER, created_ms INTEGER, updated_ms INTEGER);
CREATE INDEX IF NOT EXISTS dispute_payment ON dispute (rzp_payment_id);
CREATE TABLE IF NOT EXISTS settlement (settlement_id TEXT PRIMARY KEY, utr TEXT, currency TEXT NOT NULL DEFAULT 'INR', amount_minor INTEGER, fees_minor INTEGER, tax_minor INTEGER, status TEXT, created_ms INTEGER, updated_ms INTEGER);
-- a lost dispute is money taken back: it joins the profit and loss lines
DROP VIEW IF EXISTS pnl_lines_more;
CREATE VIEW pnl_lines_more AS SELECT 'dispute_lost' AS line_type,'out' AS direction,'razorpay / IT Services / ' || COALESCE(s.name, d.site) || ' / expense / dispute_lost' AS ledger_path, d.site, d.currency, d.amount_deducted_minor/100.0 AS amount, COALESCE(d.updated_ms,d.created_ms) AS date_ms, d.rzp_payment_id, p.rzp_order_id, p.site_payment_ref AS site_ref, d.rzp_dispute_id AS own_id, d.status FROM dispute d LEFT JOIN site s ON s.host=d.site LEFT JOIN payment p ON p.rzp_payment_id=d.rzp_payment_id WHERE d.status='lost' AND d.amount_deducted_minor>0;
DROP VIEW IF EXISTS pnl_lines;
CREATE VIEW pnl_lines AS SELECT * FROM pnl_lines_in UNION ALL SELECT * FROM pnl_lines_out UNION ALL SELECT * FROM pnl_lines_more;
DROP VIEW IF EXISTS payment_attempts;
CREATE VIEW payment_attempts AS SELECT p.txn_id, p.site_payment_ref, p.rzp_order_id, p.rzp_payment_id, p.site, COALESCE(s.name,p.site) AS site_name, p.product, p.plan, p.status, p.currency, p.amount_minor/100.0 AS amount, p.fee_minor/100.0 AS fee, p.tax_minor/100.0 AS tax, (p.amount_minor-COALESCE(p.fee_minor,0))/100.0 AS net, p.method, p.bank, p.wallet, p.card_network, p.card_type, p.card_last4, p.vpa_masked, p.rrn, p.error_code, p.error_description, p.error_reason, p.payer_email, datetime(p.created_ms/1000+19800,'unixepoch') AS created_ist, datetime(p.captured_ms/1000+19800,'unixepoch') AS captured_ist, datetime(p.failed_ms/1000+19800,'unixepoch') AS failed_ist, p.settlement_id, p.settlement_utr, datetime(p.settled_ms/1000+19800,'unixepoch') AS settled_ist, p.refunded_minor/100.0 AS refunded FROM payment p LEFT JOIN site s ON s.host=p.site;
DROP VIEW IF EXISTS ledger_issues_c;
CREATE VIEW ledger_issues_c AS SELECT 'paid_without_txn_id' AS issue, site, site_payment_ref AS ref, 1 AS n, rzp_payment_id AS ids FROM payment WHERE status='paid' AND txn_id IS NULL UNION ALL SELECT 'failed_without_reason', site, site_payment_ref, 1, rzp_payment_id FROM payment WHERE status='failed' AND error_code IS NULL AND failed_ms IS NOT NULL UNION ALL SELECT 'dispute_open_needs_reply', site, NULL, 1, rzp_dispute_id FROM dispute WHERE status IN ('open','under_review');
DROP VIEW IF EXISTS ledger_issues;
CREATE VIEW ledger_issues AS SELECT * FROM ledger_issues_a UNION ALL SELECT * FROM ledger_issues_b UNION ALL SELECT * FROM ledger_issues_c;
