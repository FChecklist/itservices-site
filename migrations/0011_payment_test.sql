-- Payment tests (owner order 14 Oct 2026): a Rs 1 payment that buys nothing, made on the central page /paytest/ (and by the games' own test pages).
-- A test is real money in Razorpay (ledger A) and a row in this ledger (B) with is_test = 1. It is NOT a sale: it is left out of revenue and profit and loss,
-- the tax summary, commission, the C-to-B comparison and the ledger problem list, and the owner report shows it as its own "payment tests" line.
-- Applied ONCE (the ALTERs fail on a second run: mig_all.py tolerates "duplicate column"); everything else is safe to repeat.
ALTER TABLE payment ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment ADD COLUMN test_from TEXT;
ALTER TABLE payment ADD COLUMN receipt_ms INTEGER;
ALTER TABLE pay_order ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pay_order ADD COLUMN test_from TEXT;
ALTER TABLE pay_order ADD COLUMN consent_ms INTEGER;
ALTER TABLE pay_order ADD COLUMN consent_version TEXT;
UPDATE payment SET is_test = 1 WHERE product_type = 'payment_test' OR plan = 'payment_test' OR product = 'payment_test';
UPDATE pay_order SET is_test = 1 WHERE plan = 'payment_test';
CREATE INDEX IF NOT EXISTS payment_test_flag ON payment (is_test, site);
CREATE INDEX IF NOT EXISTS pay_order_test ON pay_order (is_test, created_ms);

-- the central website itself is a registered site (its own payment tests are filed under it); txn_id = ITS-<test payment id>
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('itservices-rajat-agarwal.pages.dev','IT Services (payment test)',NULL);
INSERT OR IGNORE INTO product_catalog(product,product_type,site,name,notes) VALUES('payment_test','payment_test','itservices-rajat-agarwal.pages.dev','Payment test','Rs 1, buys nothing; is_test = 1');
INSERT OR IGNORE INTO plan_catalog(site,stream,plan,name,currency,amount_minor,notes) VALUES('itservices-rajat-agarwal.pages.dev','sales','payment_test','Payment test (buys nothing)','INR',100,'Rs 1');

-- money in: a payment test is not a sale
DROP VIEW IF EXISTS pnl_lines;
DROP VIEW IF EXISTS pnl_lines_in;
DROP VIEW IF EXISTS pnl_lines_out;
CREATE VIEW pnl_lines_in AS
  SELECT 'sale' AS line_type, 'in' AS direction, 'razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / ' || p.stream || ' / ' || COALESCE(p.plan,'-') AS ledger_path,
         p.site, p.currency, p.amount_minor/100.0 AS amount, p.captured_ms AS date_ms, p.rzp_payment_id, p.rzp_order_id, p.site_payment_ref AS site_ref, p.rzp_payment_id AS own_id, 'paid' AS status
    FROM payment p LEFT JOIN site s ON s.host=p.site WHERE p.status='paid' AND p.captured_ms IS NOT NULL AND p.is_test=0
  UNION ALL SELECT 'gateway_fee','out','razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / expense / gateway_fee', p.site, p.currency, COALESCE(p.fee_minor,0)/100.0 - COALESCE(p.tax_minor,0)/100.0, p.captured_ms, p.rzp_payment_id, p.rzp_order_id, p.site_payment_ref, p.rzp_payment_id, 'paid'
    FROM payment p LEFT JOIN site s ON s.host=p.site WHERE p.status='paid' AND p.captured_ms IS NOT NULL AND p.is_test=0 AND COALESCE(p.fee_minor,0) > 0
  UNION ALL SELECT 'gateway_tax','out','razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / expense / gateway_tax', p.site, p.currency, COALESCE(p.tax_minor,0)/100.0, p.captured_ms, p.rzp_payment_id, p.rzp_order_id, p.site_payment_ref, p.rzp_payment_id, 'paid'
    FROM payment p LEFT JOIN site s ON s.host=p.site WHERE p.status='paid' AND p.captured_ms IS NOT NULL AND p.is_test=0 AND COALESCE(p.tax_minor,0) > 0;
CREATE VIEW pnl_lines_out AS
  SELECT 'refund','out','razorpay / IT Services / ' || COALESCE(s.name, r.site) || ' / expense / refund', r.site, r.currency, r.amount_minor/100.0, r.created_ms, r.rzp_payment_id, p.rzp_order_id, p.site_payment_ref, r.rzp_refund_id, r.status
    FROM refund r LEFT JOIN site s ON s.host=r.site LEFT JOIN payment p ON p.rzp_payment_id=r.rzp_payment_id WHERE COALESCE(p.is_test,0)=0
  UNION ALL SELECT CASE WHEN o.status='paid' THEN 'commission_paid' ELSE 'commission_accrued' END,'out','razorpay / IT Services / ' || COALESCE(s.name, o.site) || ' / ' || o.stream || ' / ' || COALESCE(o.plan,'-'), o.site, o.currency, o.amount_minor/100.0, COALESCE(o.paid_ms, o.created_ms), o.source_payment_id, p.rzp_order_id, o.site_ref, o.id, o.status
    FROM payout o LEFT JOIN site s ON s.host=o.site LEFT JOIN payment p ON p.rzp_payment_id=o.source_payment_id WHERE o.status IN ('planned','approved','paid')
  UNION ALL SELECT 'expense','out','razorpay / IT Services / ' || COALESCE(s.name, e.site, 'company') || ' / expense / ' || e.category, e.site, e.currency, (e.amount_minor + e.tax_minor)/100.0, e.incurred_ms, e.rzp_payment_id, NULL, e.source_ref, e.id, 'recorded'
    FROM expense e LEFT JOIN site s ON s.host=e.site;
CREATE VIEW pnl_lines AS SELECT * FROM pnl_lines_in UNION ALL SELECT * FROM pnl_lines_out UNION ALL SELECT * FROM pnl_lines_more;

-- the master ledger and the tax summary: only real sales and paid payouts
DROP VIEW IF EXISTS tax_summary;
DROP VIEW IF EXISTS master_ledger;
CREATE VIEW master_ledger AS
  SELECT 'razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / ' || p.stream || ' / ' || COALESCE(p.plan,'-') AS ledger_path,
         'in' AS direction, p.site, p.stream, p.plan, p.product, p.product_type, p.payer_email AS party, p.payer_user AS party_ref, p.currency, p.amount_minor/100.0 AS amount, p.amount_minor/100.0 AS signed_amount, 0 AS tds, p.rzp_payment_id AS razorpay_ref, p.site_payment_ref AS site_ref, p.status, p.method, p.captured_ms AS date_ms,
         datetime(p.captured_ms/1000,'unixepoch') AS date_utc,
         CASE WHEN CAST(strftime('%m',p.captured_ms/1000,'unixepoch') AS INTEGER) >= 4 THEN strftime('%Y',p.captured_ms/1000,'unixepoch') || '-' || substr(CAST(CAST(strftime('%Y',p.captured_ms/1000,'unixepoch') AS INTEGER)+1 AS TEXT),3,2) ELSE CAST(CAST(strftime('%Y',p.captured_ms/1000,'unixepoch') AS INTEGER)-1 AS TEXT) || '-' || substr(strftime('%Y',p.captured_ms/1000,'unixepoch'),3,2) END AS financial_year
    FROM payment p LEFT JOIN site s ON s.host = p.site WHERE p.status = 'paid' AND p.captured_ms IS NOT NULL AND p.is_test = 0
  UNION ALL
  SELECT 'razorpay / IT Services / ' || COALESCE(s.name, o.site) || ' / ' || o.stream || ' / ' || COALESCE(o.plan,'-'),
         'out', o.site, o.stream, o.plan, NULL, NULL, o.payee_name, o.payee_ref, o.currency, o.amount_minor/100.0, -o.amount_minor/100.0, o.tds_minor/100.0, COALESCE(o.rzp_payout_id, o.utr), o.source_payment_id, o.status, o.method, o.paid_ms,
         datetime(o.paid_ms/1000,'unixepoch'),
         CASE WHEN CAST(strftime('%m',o.paid_ms/1000,'unixepoch') AS INTEGER) >= 4 THEN strftime('%Y',o.paid_ms/1000,'unixepoch') || '-' || substr(CAST(CAST(strftime('%Y',o.paid_ms/1000,'unixepoch') AS INTEGER)+1 AS TEXT),3,2) ELSE CAST(CAST(strftime('%Y',o.paid_ms/1000,'unixepoch') AS INTEGER)-1 AS TEXT) || '-' || substr(strftime('%Y',o.paid_ms/1000,'unixepoch'),3,2) END
    FROM payout o LEFT JOIN site s ON s.host = o.site WHERE o.status = 'paid' AND o.paid_ms IS NOT NULL;
CREATE VIEW tax_summary AS SELECT financial_year, site, stream, COALESCE(plan,'-') AS plan, currency, direction, COUNT(*) AS entries, SUM(amount) AS total, SUM(tds) AS tds_total FROM master_ledger GROUP BY financial_year, site, stream, COALESCE(plan,'-'), currency, direction;

-- the problem list: a payment test never raises a payment problem; a commission on a test payment does
DROP VIEW IF EXISTS ledger_issues;
DROP VIEW IF EXISTS ledger_issues_a;
DROP VIEW IF EXISTS ledger_issues_b;
DROP VIEW IF EXISTS ledger_issues_c;
CREATE VIEW ledger_issues_a AS
  SELECT 'paid_twice_for_one_site_payment' AS issue, site, site_payment_ref AS ref, COUNT(*) AS n, GROUP_CONCAT(rzp_payment_id) AS ids FROM payment WHERE status='paid' AND is_test=0 AND site_payment_ref IS NOT NULL GROUP BY site, site_payment_ref HAVING COUNT(*)>1
  UNION ALL SELECT 'paid_without_fee_figures', site, site_payment_ref, 1, rzp_payment_id FROM payment WHERE status='paid' AND is_test=0 AND fee_minor IS NULL AND captured_ms < (strftime('%s','now')-3600)*1000
  UNION ALL SELECT 'paid_without_site_payment_ref', site, NULL, 1, rzp_payment_id FROM payment WHERE status='paid' AND is_test=0 AND site_payment_ref IS NULL;
CREATE VIEW ledger_issues_b AS
  SELECT 'commission_without_payment_link', site, site_ref, 1, id FROM payout WHERE stream='refer_and_earn' AND (source_payment_id IS NULL OR source_payment_id NOT IN (SELECT rzp_payment_id FROM payment))
  UNION ALL SELECT 'commission_on_unpaid_or_refunded_payment', o.site, o.site_ref, 1, o.id FROM payout o JOIN payment p ON p.rzp_payment_id=o.source_payment_id WHERE o.status IN ('planned','approved','paid') AND p.is_test=0 AND (p.status<>'paid' OR p.refunded_minor >= p.amount_minor)
  UNION ALL SELECT 'commission_on_test_payment', o.site, o.site_ref, 1, o.id FROM payout o JOIN payment p ON p.rzp_payment_id=o.source_payment_id WHERE o.status IN ('planned','approved','paid') AND p.is_test=1
  UNION ALL SELECT 'refund_without_payment', r.site, NULL, 1, r.rzp_refund_id FROM refund r WHERE r.rzp_payment_id NOT IN (SELECT rzp_payment_id FROM payment);
CREATE VIEW ledger_issues_c AS
  SELECT 'paid_without_txn_id' AS issue, site, site_payment_ref AS ref, 1 AS n, rzp_payment_id AS ids FROM payment WHERE status='paid' AND is_test=0 AND txn_id IS NULL
  UNION ALL SELECT 'failed_without_reason', site, site_payment_ref, 1, rzp_payment_id FROM payment WHERE status='failed' AND is_test=0 AND error_code IS NULL AND failed_ms IS NOT NULL
  UNION ALL SELECT 'dispute_open_needs_reply', site, NULL, 1, rzp_dispute_id FROM dispute WHERE status IN ('open','under_review');
CREATE VIEW ledger_issues AS SELECT * FROM ledger_issues_a UNION ALL SELECT * FROM ledger_issues_b UNION ALL SELECT * FROM ledger_issues_c;

-- every attempt (now with the test flag) and, on their own, the payment tests
DROP VIEW IF EXISTS payment_attempts;
CREATE VIEW payment_attempts AS SELECT p.txn_id, p.site_payment_ref, p.rzp_order_id, p.rzp_payment_id, p.site, COALESCE(s.name,p.site) AS site_name, p.product, p.plan, p.status, p.currency, p.amount_minor/100.0 AS amount, p.fee_minor/100.0 AS fee, p.tax_minor/100.0 AS tax, (p.amount_minor-COALESCE(p.fee_minor,0))/100.0 AS net, p.method, p.bank, p.wallet, p.card_network, p.card_type, p.card_last4, p.vpa_masked, p.rrn, p.error_code, p.error_description, p.error_reason, p.payer_email, datetime(p.created_ms/1000+19800,'unixepoch') AS created_ist, datetime(p.captured_ms/1000+19800,'unixepoch') AS captured_ist, datetime(p.failed_ms/1000+19800,'unixepoch') AS failed_ist, p.settlement_id, p.settlement_utr, datetime(p.settled_ms/1000+19800,'unixepoch') AS settled_ist, p.refunded_minor/100.0 AS refunded, p.is_test, p.test_from FROM payment p LEFT JOIN site s ON s.host=p.site;
DROP VIEW IF EXISTS payment_tests;
CREATE VIEW payment_tests AS SELECT txn_id, rzp_payment_id, site, test_from, status, currency, amount_minor/100.0 AS amount, fee_minor/100.0 AS fee, tax_minor/100.0 AS tax, refunded_minor/100.0 AS refunded, method, payer_email, error_reason, created_ms, captured_ms, failed_ms, datetime(COALESCE(captured_ms,failed_ms,created_ms)/1000+19800,'unixepoch') AS at_ist FROM payment WHERE is_test=1;
