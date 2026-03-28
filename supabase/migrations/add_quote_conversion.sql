-- Conversion devis → formation
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS converted_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
