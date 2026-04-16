-- ============================================================
-- Migration V2 : Sous-traitance + champs formateur + prix/heures apprenant
-- ============================================================

-- Sous-traitance sur la session
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_subcontracted BOOLEAN DEFAULT FALSE;

-- Enrichir formation_trainers pour le suivi formateur
ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS daily_rate DECIMAL(10,2);
ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS hours_done DECIMAL(10,2);
ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS dates_done TEXT;
ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS notes TEXT;

-- Prix/heures par apprenant sur enrollments
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS price_per_learner DECIMAL(10,2);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS hours_per_learner DECIMAL(10,2);
