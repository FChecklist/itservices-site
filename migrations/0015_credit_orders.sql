-- Moneypenny credit sales (owner order 20 Nov 2026): the ONLY caller of credit-order / credit-verify is Moneypenny.
-- The site row starts INACTIVE with no key: nothing works until the owner issues Moneypenny's site key (and sets active=1).
INSERT OR IGNORE INTO site(host,name,webhook_url,active) VALUES('moneypenny.corporatetambola.com','Moneypenny (game payments by credits)',NULL,0);
INSERT OR IGNORE INTO product_catalog(product,product_type,site,name,notes) VALUES('moneypenny_credits','credit_pack','moneypenny.corporatetambola.com','Moneypenny credits','plan = credits_N; the amount is the pack price Moneypenny sends; game_id = the game the credits were bought for');

-- A captured payment that Moneypenny must be told about, once per Razorpay payment id. Retried until Moneypenny takes it (or a person looks).
CREATE TABLE IF NOT EXISTS credit_outbox (
  rzp_payment_id TEXT PRIMARY KEY,
  rzp_order_id TEXT NOT NULL,
  mp_order_id TEXT NOT NULL,          -- Moneypenny's own order id (pay_order.site_payment_ref)
  payer_email TEXT NOT NULL,          -- the e-mail fixed when the order was made, never one typed later
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_ms INTEGER NOT NULL,
  last_error TEXT,
  created_ms INTEGER NOT NULL,
  sent_ms INTEGER
);
CREATE INDEX IF NOT EXISTS credit_outbox_due ON credit_outbox (status, next_ms);
