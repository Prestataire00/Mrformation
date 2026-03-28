-- ============================================================
-- Enrichissement fiches formateurs et apprenants
-- ============================================================

-- 1. Formateurs : coordonnées bancaires + statut juridique
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS bic TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS legal_status TEXT CHECK (
  legal_status IN (
    'auto_entrepreneur', 'sasu', 'eurl', 'sarl',
    'portage_salarial', 'salarie', 'autre'
  )
);
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS tva_number TEXT;

-- 2. Apprenants : informations personnelles + niveau
ALTER TABLE learners ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS gender TEXT CHECK (
  gender IN ('M', 'F', 'autre')
);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS social_security_number TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS education_level TEXT CHECK (
  education_level IN (
    'bac_moins', 'bac', 'bac_plus_2',
    'bac_plus_3', 'bac_plus_5', 'bac_plus_8'
  )
);
