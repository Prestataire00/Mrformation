-- ============================================================
-- Migration : Prix et heures individuels apprenants/formateurs
-- ============================================================

-- Prix et heures individualisés par apprenant
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS individual_price DECIMAL(10,2);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS individual_hours DECIMAL(5,2);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS price_note TEXT;

-- Dates effectuées par formateur (JSONB array de dates YYYY-MM-DD)
ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS effective_dates JSONB DEFAULT '[]'::jsonb;
-- Montant total calculé (daily_rate × jours effectifs)
ALTER TABLE formation_trainers ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2);
