-- Migration BPF: champs de qualification pour le Bilan Pédagogique et Financier
-- Réf: cadrage-module-bpf.md v2
-- Idempotente (ADD COLUMN IF NOT EXISTS + DO $$ EXCEPTION blocks)

-- ═══════════════════════════════════════════════════════════
-- 1. invoice_date sur formation_invoices
-- ═══════════════════════════════════════════════════════════
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;
UPDATE formation_invoices SET invoice_date = created_at::date WHERE invoice_date IS NULL;
ALTER TABLE formation_invoices ALTER COLUMN invoice_date SET NOT NULL;
ALTER TABLE formation_invoices ALTER COLUMN invoice_date SET DEFAULT CURRENT_DATE;

-- ═══════════════════════════════════════════════════════════
-- 2. invoice_date_confirmed sur formation_invoices
--    FALSE = date d'import (non fiable pour le BPF)
--    TRUE  = date saisie dans le LMS ou confirmée par l'utilisateur
-- ═══════════════════════════════════════════════════════════
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS invoice_date_confirmed BOOLEAN DEFAULT TRUE;
-- Factures importées (external_reference IS NOT NULL) → non confirmées
UPDATE formation_invoices SET invoice_date_confirmed = FALSE
  WHERE external_reference IS NOT NULL AND invoice_date_confirmed IS DISTINCT FROM FALSE;

-- ═══════════════════════════════════════════════════════════
-- 3. bpf_trainee_type sur enrollments
--    Valeurs = cadres F-1 du Cerfa 10443
-- ═══════════════════════════════════════════════════════════
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS bpf_trainee_type TEXT DEFAULT 'salarie_prive';

DO $$ BEGIN
  ALTER TABLE enrollments ADD CONSTRAINT enrollments_bpf_trainee_type_check
    CHECK (bpf_trainee_type IN ('salarie_prive', 'apprenti', 'demandeur_emploi', 'particulier', 'autre'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill depuis learners.learner_type (100% des learners ont un learner_type)
UPDATE enrollments e
SET bpf_trainee_type = CASE l.learner_type
  WHEN 'salarie' THEN 'salarie_prive'
  WHEN 'apprenti' THEN 'apprenti'
  WHEN 'demandeur_emploi' THEN 'demandeur_emploi'
  WHEN 'particulier' THEN 'particulier'
  WHEN 'autre' THEN 'autre'
  ELSE 'salarie_prive'
END
FROM learners l WHERE l.id = e.learner_id;

-- ═══════════════════════════════════════════════════════════
-- 4. is_subcontracted_to_other_of sur sessions
--    Cadre F-2 BPF : la formation est sous-traitée À un autre OF
--    DISTINCT de formation_trainers.is_subcontracted (formateurs sous-traitants)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_subcontracted_to_other_of BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN sessions.is_subcontracted_to_other_of IS
  'Cadre F-2 BPF : formation sous-traitée À un autre OF. Distinct de formation_trainers.is_subcontracted (formateurs sous-traitants).';
