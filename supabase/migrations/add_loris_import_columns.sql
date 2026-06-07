-- Migration : add_loris_import_columns
-- Date : 2026-06-08
-- Contexte : import one-shot des 8 fichiers Loris (4 267 lignes total) dans MR FORMATION.
--   - loris_external_id : ID source Loris pour traçabilité + idempotence
--   - loris_metadata    : JSONB contenant les champs Loris sans cible DB native
--   (formation_invoices utilise external_reference + external_source déjà existants)

-- 1. clients
ALTER TABLE IF EXISTS clients
  ADD COLUMN IF NOT EXISTS loris_external_id TEXT,
  ADD COLUMN IF NOT EXISTS loris_metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_clients_loris_external_id ON clients (loris_external_id) WHERE loris_external_id IS NOT NULL;

-- 2. learners
ALTER TABLE IF EXISTS learners
  ADD COLUMN IF NOT EXISTS loris_external_id TEXT,
  ADD COLUMN IF NOT EXISTS loris_metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_learners_loris_external_id ON learners (loris_external_id) WHERE loris_external_id IS NOT NULL;

-- 3. trainings
ALTER TABLE IF EXISTS trainings
  ADD COLUMN IF NOT EXISTS loris_external_id TEXT,
  ADD COLUMN IF NOT EXISTS loris_metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_trainings_loris_external_id ON trainings (loris_external_id) WHERE loris_external_id IS NOT NULL;

-- 4. sessions
ALTER TABLE IF EXISTS sessions
  ADD COLUMN IF NOT EXISTS loris_external_id TEXT,
  ADD COLUMN IF NOT EXISTS loris_metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_sessions_loris_external_id ON sessions (loris_external_id) WHERE loris_external_id IS NOT NULL;

-- 5. formation_trainers
ALTER TABLE IF EXISTS formation_trainers
  ADD COLUMN IF NOT EXISTS loris_external_id TEXT,
  ADD COLUMN IF NOT EXISTS loris_metadata JSONB DEFAULT '{}'::jsonb;

-- 6. enrollments
ALTER TABLE IF EXISTS enrollments
  ADD COLUMN IF NOT EXISTS loris_external_id TEXT,
  ADD COLUMN IF NOT EXISTS loris_metadata JSONB DEFAULT '{}'::jsonb;

-- 7. crm_quotes
ALTER TABLE IF EXISTS crm_quotes
  ADD COLUMN IF NOT EXISTS loris_external_id TEXT,
  ADD COLUMN IF NOT EXISTS loris_metadata JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_crm_quotes_loris_external_id ON crm_quotes (loris_external_id) WHERE loris_external_id IS NOT NULL;

-- Note : formation_invoices n'a pas besoin — utilise external_reference + external_source = 'loris'
