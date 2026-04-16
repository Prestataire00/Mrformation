-- ============================================================
-- Migration : Ajouter adresse, ville, code postal sur prospects
-- ============================================================

ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS postal_code TEXT;
