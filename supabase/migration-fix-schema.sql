-- ============================================================
-- MIGRATION: Fix schema/code mismatch
-- Coller dans Supabase SQL Editor > Run
-- ============================================================

-- ============================================================
-- 1. Nouvelle table: training_domains
-- ============================================================
CREATE TABLE IF NOT EXISTS training_domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE training_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_domains_fallback" ON training_domains;
CREATE POLICY "training_domains_fallback" ON training_domains
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. ALTER clients — colonnes manquantes
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'France';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS opco TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS funding_type TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 3. ALTER trainings — colonnes manquantes
-- ============================================================
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS duration_days DECIMAL(5, 2);
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS min_participants INTEGER;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS program TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS certification_name TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS training_domain_id UUID REFERENCES training_domains(id) ON DELETE SET NULL;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 4. ALTER trainers — colonnes manquantes
-- ============================================================
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'France';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 5. ALTER trainer_competencies — FK vers training_domains
-- ============================================================
ALTER TABLE trainer_competencies ADD COLUMN IF NOT EXISTS training_domain_id UUID REFERENCES training_domains(id) ON DELETE CASCADE;

-- ============================================================
-- 6. ALTER sessions — colonnes manquantes + relax constraints
-- ============================================================
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Relax NOT NULL constraints (l'app autorise les valeurs null)
ALTER TABLE sessions ALTER COLUMN end_date DROP NOT NULL;
ALTER TABLE sessions ALTER COLUMN title DROP NOT NULL;

-- Elargir le CHECK constraint sur status pour inclure 'planned'
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled', 'planned'));

-- ============================================================
-- Vérification
-- ============================================================
SELECT 'MIGRATION OK — Schema aligné avec le code app.' AS result;
