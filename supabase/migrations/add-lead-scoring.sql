-- Add score column to crm_prospects for lead scoring
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
