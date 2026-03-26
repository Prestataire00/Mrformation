-- Add NAF code field to clients, prospects, and campaigns for targeting
ALTER TABLE clients ADD COLUMN IF NOT EXISTS naf_code TEXT DEFAULT NULL;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS naf_code TEXT DEFAULT NULL;
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS naf_code TEXT DEFAULT NULL;

-- Index for efficient NAF code lookups
CREATE INDEX IF NOT EXISTS idx_clients_naf_code ON clients (naf_code) WHERE naf_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_prospects_naf_code ON crm_prospects (naf_code) WHERE naf_code IS NOT NULL;
