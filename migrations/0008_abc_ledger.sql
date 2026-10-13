-- Three connected ledgers (owner order 2026-10-13):  A = Razorpay (its own transaction ids)  B = this central ledger of IT Services by Rajat Agarwal  C = each website's own ledger.
-- The ids that tie them together, one meaning each, never reused:
--   rzp_payment_id (pay_...)   A <-> B <-> C   one money-in
--   rzp_order_id   (order_...) A <-> B <-> C   the order that money was paid against
--   site_payment_ref           B <-> C         the website's own payment id (C: payment.id)
--   rzp_refund_id  (rfnd_...)  A <-> B         one refund
--   payout.site_ref            B <-> C         the website's own commission id (C: commission.id)
--   payout.source_payment_id   B  -> A         the rzp_payment_id the commission was earned on
--   expense.source+source_ref  B               an expense entered once (a bill number, or a Razorpay id)
ALTER TABLE payment ADD COLUMN fee_minor INTEGER;
ALTER TABLE payment ADD COLUMN tax_minor INTEGER;
ALTER TABLE payment ADD COLUMN refunded_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment ADD COLUMN settlement_id TEXT;
ALTER TABLE payment ADD COLUMN reconciled_ms INTEGER;
ALTER TABLE payout ADD COLUMN site_ref TEXT;
CREATE INDEX IF NOT EXISTS payment_site_ref ON payment (site, site_payment_ref);
CREATE UNIQUE INDEX IF NOT EXISTS payout_site_ref ON payout (site, site_ref) WHERE site_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS refund (rzp_refund_id TEXT PRIMARY KEY, rzp_payment_id TEXT NOT NULL, site TEXT, currency TEXT, amount_minor INTEGER NOT NULL, status TEXT, created_ms INTEGER, updated_ms INTEGER);
CREATE INDEX IF NOT EXISTS refund_payment ON refund (rzp_payment_id);
CREATE TABLE IF NOT EXISTS expense (id TEXT PRIMARY KEY, site TEXT, category TEXT NOT NULL, description TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', amount_minor INTEGER NOT NULL, tax_minor INTEGER NOT NULL DEFAULT 0, incurred_ms INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'manual', source_ref TEXT, rzp_payment_id TEXT, doc_ref TEXT, created_ms INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS expense_source ON expense (source, source_ref) WHERE source_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS recon_run (id INTEGER PRIMARY KEY AUTOINCREMENT, run_ms INTEGER NOT NULL, days INTEGER, razorpay_seen INTEGER, filed INTEGER, unassigned TEXT, missing_in_razorpay TEXT, amount_mismatch TEXT, duplicate_paid TEXT);
DROP VIEW IF EXISTS pnl_lines;
DROP VIEW IF EXISTS pnl_lines_in;
DROP VIEW IF EXISTS pnl_lines_out;
CREATE VIEW pnl_lines_in AS
  SELECT 'sale' AS line_type, 'in' AS direction, 'razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / ' || p.stream || ' / ' || COALESCE(p.plan,'-') AS ledger_path,
         p.site, p.currency, p.amount_minor/100.0 AS amount, p.captured_ms AS date_ms, p.rzp_payment_id, p.rzp_order_id, p.site_payment_ref AS site_ref, p.rzp_payment_id AS own_id, 'paid' AS status
    FROM payment p LEFT JOIN site s ON s.host=p.site WHERE p.status='paid' AND p.captured_ms IS NOT NULL
  UNION ALL SELECT 'gateway_fee','out','razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / expense / gateway_fee', p.site, p.currency, COALESCE(p.fee_minor,0)/100.0 - COALESCE(p.tax_minor,0)/100.0, p.captured_ms, p.rzp_payment_id, p.rzp_order_id, p.site_payment_ref, p.rzp_payment_id, 'paid'
    FROM payment p LEFT JOIN site s ON s.host=p.site WHERE p.status='paid' AND p.captured_ms IS NOT NULL AND COALESCE(p.fee_minor,0) > 0
  UNION ALL SELECT 'gateway_tax','out','razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / expense / gateway_tax', p.site, p.currency, COALESCE(p.tax_minor,0)/100.0, p.captured_ms, p.rzp_payment_id, p.rzp_order_id, p.site_payment_ref, p.rzp_payment_id, 'paid'
    FROM payment p LEFT JOIN site s ON s.host=p.site WHERE p.status='paid' AND p.captured_ms IS NOT NULL AND COALESCE(p.tax_minor,0) > 0;
CREATE VIEW pnl_lines_out AS

  SELECT 'refund','out','razorpay / IT Services / ' || COALESCE(s.name, r.site) || ' / expense / refund', r.site, r.currency, r.amount_minor/100.0, r.created_ms, r.rzp_payment_id, p.rzp_order_id, p.site_payment_ref, r.rzp_refund_id, r.status
    FROM refund r LEFT JOIN site s ON s.host=r.site LEFT JOIN payment p ON p.rzp_payment_id=r.rzp_payment_id
  UNION ALL SELECT CASE WHEN o.status='paid' THEN 'commission_paid' ELSE 'commission_accrued' END,'out','razorpay / IT Services / ' || COALESCE(s.name, o.site) || ' / ' || o.stream || ' / ' || COALESCE(o.plan,'-'), o.site, o.currency, o.amount_minor/100.0, COALESCE(o.paid_ms, o.created_ms), o.source_payment_id, p.rzp_order_id, o.site_ref, o.id, o.status
    FROM payout o LEFT JOIN site s ON s.host=o.site LEFT JOIN payment p ON p.rzp_payment_id=o.source_payment_id WHERE o.status IN ('planned','approved','paid')
  UNION ALL SELECT 'expense','out','razorpay / IT Services / ' || COALESCE(s.name, e.site, 'company') || ' / expense / ' || e.category, e.site, e.currency, (e.amount_minor + e.tax_minor)/100.0, e.incurred_ms, e.rzp_payment_id, NULL, e.source_ref, e.id, 'recorded'
    FROM expense e LEFT JOIN site s ON s.host=e.site;
CREATE VIEW pnl_lines AS SELECT * FROM pnl_lines_in UNION ALL SELECT * FROM pnl_lines_out;
DROP VIEW IF EXISTS pnl_summary;
CREATE VIEW pnl_summary AS
  SELECT CASE WHEN CAST(strftime('%m',date_ms/1000,'unixepoch') AS INTEGER) >= 4 THEN strftime('%Y',date_ms/1000,'unixepoch') || '-' || substr(CAST(CAST(strftime('%Y',date_ms/1000,'unixepoch') AS INTEGER)+1 AS TEXT),3,2)
              ELSE CAST(CAST(strftime('%Y',date_ms/1000,'unixepoch') AS INTEGER)-1 AS TEXT) || '-' || substr(strftime('%Y',date_ms/1000,'unixepoch'),3,2) END AS financial_year,
         COALESCE(site,'company') AS site, currency,
         ROUND(SUM(CASE WHEN line_type='sale' THEN amount ELSE 0 END),2) AS revenue,
         ROUND(SUM(CASE WHEN line_type='gateway_fee' THEN amount ELSE 0 END),2) AS gateway_fee,
         ROUND(SUM(CASE WHEN line_type='gateway_tax' THEN amount ELSE 0 END),2) AS gateway_tax,
         ROUND(SUM(CASE WHEN line_type='refund' THEN amount ELSE 0 END),2) AS refunds,
         ROUND(SUM(CASE WHEN line_type='commission_paid' THEN amount ELSE 0 END),2) AS commission_paid,
         ROUND(SUM(CASE WHEN line_type='commission_accrued' THEN amount ELSE 0 END),2) AS commission_accrued,
         ROUND(SUM(CASE WHEN line_type='expense' THEN amount ELSE 0 END),2) AS other_expense,
         ROUND(SUM(CASE WHEN line_type='sale' THEN amount WHEN line_type IN ('gateway_fee','gateway_tax','refund','commission_paid','expense') THEN -amount ELSE 0 END),2) AS net_cash,
         ROUND(SUM(CASE WHEN line_type='sale' THEN amount WHEN line_type<>'sale' THEN -amount ELSE 0 END),2) AS net_after_accrued
    FROM pnl_lines WHERE date_ms IS NOT NULL GROUP BY 1,2,3;
DROP VIEW IF EXISTS ledger_issues;
DROP VIEW IF EXISTS ledger_issues_a;
DROP VIEW IF EXISTS ledger_issues_b;
CREATE VIEW ledger_issues_a AS
  SELECT 'paid_twice_for_one_site_payment' AS issue, site, site_payment_ref AS ref, COUNT(*) AS n, GROUP_CONCAT(rzp_payment_id) AS ids FROM payment WHERE status='paid' AND site_payment_ref IS NOT NULL GROUP BY site, site_payment_ref HAVING COUNT(*)>1
  UNION ALL SELECT 'paid_without_fee_figures', site, site_payment_ref, 1, rzp_payment_id FROM payment WHERE status='paid' AND fee_minor IS NULL AND captured_ms < (strftime('%s','now')-3600)*1000
  UNION ALL SELECT 'paid_without_site_payment_ref', site, NULL, 1, rzp_payment_id FROM payment WHERE status='paid' AND site_payment_ref IS NULL;
CREATE VIEW ledger_issues_b AS
SELECT 'commission_without_payment_link', site, site_ref, 1, id FROM payout WHERE stream='refer_and_earn' AND (source_payment_id IS NULL OR source_payment_id NOT IN (SELECT rzp_payment_id FROM payment))
  UNION ALL SELECT 'commission_on_unpaid_or_refunded_payment', o.site, o.site_ref, 1, o.id FROM payout o JOIN payment p ON p.rzp_payment_id=o.source_payment_id WHERE o.status IN ('planned','approved','paid') AND (p.status<>'paid' OR p.refunded_minor >= p.amount_minor)
  UNION ALL SELECT 'refund_without_payment', r.site, NULL, 1, r.rzp_refund_id FROM refund r WHERE r.rzp_payment_id NOT IN (SELECT rzp_payment_id FROM payment);
CREATE VIEW ledger_issues AS SELECT * FROM ledger_issues_a UNION ALL SELECT * FROM ledger_issues_b;
