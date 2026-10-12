-- Temporary diagnostic: keep the raw body and signature of webhook calls whose signature did not match (purge after the secret is fixed). Route DPDP events to its edge function.
ALTER TABLE webhook_log ADD COLUMN raw_body TEXT;
ALTER TABLE webhook_log ADD COLUMN raw_sig TEXT;
UPDATE site SET webhook_url='https://pcrjmlpuqsbocqfwoxod.supabase.co/functions/v1/dpdp-pay/webhook' WHERE host='veridian-aios.com';
