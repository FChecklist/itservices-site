-- Orders created centrally (money in): one row per Razorpay order, before and after payment. Safe to repeat except the ALTER.
ALTER TABLE site ADD COLUMN key_hash TEXT;
CREATE TABLE IF NOT EXISTS pay_order (rzp_order_id TEXT PRIMARY KEY, site TEXT NOT NULL, stream TEXT NOT NULL DEFAULT 'sales', product TEXT, plan TEXT, site_payment_ref TEXT, payer_user TEXT, payer_email TEXT, payer_phone TEXT, currency TEXT NOT NULL, amount_minor INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'created', created_ms INTEGER NOT NULL, paid_ms INTEGER);
CREATE INDEX IF NOT EXISTS pay_order_site ON pay_order (site, site_payment_ref);
