-- One Razorpay ledger for income tax. Template for every line:  razorpay / IT Services / <website> / <stream> / <plan>
-- streams: sales (money in) | refer_and_earn, sales_team_commission, sales_team_salary (money out). A new website, product or plan is only new rows, never a new table.
ALTER TABLE payment ADD COLUMN stream TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE payment ADD COLUMN plan TEXT;
UPDATE payment SET plan = product_ref WHERE plan IS NULL;
CREATE TABLE IF NOT EXISTS stream (code TEXT PRIMARY KEY, direction TEXT NOT NULL CHECK (direction IN ('in','out')), name TEXT NOT NULL, tax_note TEXT);
INSERT OR IGNORE INTO stream(code,direction,name,tax_note) VALUES('sales','in','Sales','Income. GST not charged while the seller is not GST registered.');
INSERT OR IGNORE INTO stream(code,direction,name,tax_note) VALUES('refer_and_earn','out','Refer and earn payouts','Expense. TDS may apply to the partner (rows keep tds_minor).');
INSERT OR IGNORE INTO stream(code,direction,name,tax_note) VALUES('sales_team_commission','out','Sales team commission','Expense. TDS may apply (rows keep tds_minor).');
INSERT OR IGNORE INTO stream(code,direction,name,tax_note) VALUES('sales_team_salary','out','Sales team salary','Expense. TDS on salary applies (rows keep tds_minor).');
-- plans: the sellable or payable variations of a product on a website (one row per plan). Amounts are the standard amount, in minor units (paise / cents); 0 = varies.
CREATE TABLE IF NOT EXISTS plan_catalog (site TEXT NOT NULL, stream TEXT NOT NULL, plan TEXT NOT NULL, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', amount_minor INTEGER NOT NULL DEFAULT 0, notes TEXT, PRIMARY KEY (site, stream, plan));
-- money out, one row per payout. Created as planned/approved by the website or the owner; becomes paid only with a real Razorpay payout id / bank reference. This system records payouts, it does not move money by itself.
CREATE TABLE IF NOT EXISTS payout (id TEXT PRIMARY KEY, site TEXT NOT NULL, stream TEXT NOT NULL, plan TEXT, payee_ref TEXT NOT NULL, payee_name TEXT, currency TEXT NOT NULL DEFAULT 'INR', amount_minor INTEGER NOT NULL, tds_minor INTEGER NOT NULL DEFAULT 0, period TEXT, source_payment_id TEXT, status TEXT NOT NULL DEFAULT 'planned', method TEXT, rzp_payout_id TEXT, utr TEXT, notes TEXT, created_ms INTEGER NOT NULL, paid_ms INTEGER, updated_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS payout_site ON payout (site, stream, plan);
CREATE INDEX IF NOT EXISTS payout_status ON payout (status);
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('corporate-tambola.pages.dev','Corporate Tambola','https://corporate-tambola.pages.dev/api/payments/webhook');
-- the single ledger: every paid sale (in) and every paid payout (out), signed amount, Indian financial year
DROP VIEW IF EXISTS master_ledger;
CREATE VIEW master_ledger AS
  SELECT 'razorpay / IT Services / ' || COALESCE(s.name, p.site) || ' / ' || p.stream || ' / ' || COALESCE(p.plan,'-') AS ledger_path,
         'in' AS direction, p.site, p.stream, p.plan, p.product, p.product_type, p.payer_email AS party, p.payer_user AS party_ref, p.currency, p.amount_minor/100.0 AS amount, p.amount_minor/100.0 AS signed_amount, 0 AS tds, p.rzp_payment_id AS razorpay_ref, p.site_payment_ref AS site_ref, p.status, p.method, p.captured_ms AS date_ms,
         datetime(p.captured_ms/1000,'unixepoch') AS date_utc,
         CASE WHEN CAST(strftime('%m',p.captured_ms/1000,'unixepoch') AS INTEGER) >= 4 THEN strftime('%Y',p.captured_ms/1000,'unixepoch') || '-' || substr(CAST(CAST(strftime('%Y',p.captured_ms/1000,'unixepoch') AS INTEGER)+1 AS TEXT),3,2) ELSE CAST(CAST(strftime('%Y',p.captured_ms/1000,'unixepoch') AS INTEGER)-1 AS TEXT) || '-' || substr(strftime('%Y',p.captured_ms/1000,'unixepoch'),3,2) END AS financial_year
    FROM payment p LEFT JOIN site s ON s.host = p.site WHERE p.status = 'paid' AND p.captured_ms IS NOT NULL
  UNION ALL
  SELECT 'razorpay / IT Services / ' || COALESCE(s.name, o.site) || ' / ' || o.stream || ' / ' || COALESCE(o.plan,'-'),
         'out', o.site, o.stream, o.plan, NULL, NULL, o.payee_name, o.payee_ref, o.currency, o.amount_minor/100.0, -o.amount_minor/100.0, o.tds_minor/100.0, COALESCE(o.rzp_payout_id, o.utr), o.source_payment_id, o.status, o.method, o.paid_ms,
         datetime(o.paid_ms/1000,'unixepoch'),
         CASE WHEN CAST(strftime('%m',o.paid_ms/1000,'unixepoch') AS INTEGER) >= 4 THEN strftime('%Y',o.paid_ms/1000,'unixepoch') || '-' || substr(CAST(CAST(strftime('%Y',o.paid_ms/1000,'unixepoch') AS INTEGER)+1 AS TEXT),3,2) ELSE CAST(CAST(strftime('%Y',o.paid_ms/1000,'unixepoch') AS INTEGER)-1 AS TEXT) || '-' || substr(strftime('%Y',o.paid_ms/1000,'unixepoch'),3,2) END
    FROM payout o LEFT JOIN site s ON s.host = o.site WHERE o.status = 'paid' AND o.paid_ms IS NOT NULL;
-- income-tax summary: totals per financial year, website, stream and plan
DROP VIEW IF EXISTS tax_summary;
CREATE VIEW tax_summary AS SELECT financial_year, site, stream, COALESCE(plan,'-') AS plan, currency, direction, COUNT(*) AS entries, SUM(amount) AS total, SUM(tds) AS tds_total FROM master_ledger GROUP BY financial_year, site, stream, COALESCE(plan,'-'), currency, direction;
