-- ============================================================
-- Migration : Permettre aux admins de remplir un questionnaire
-- pour le compte d'un apprenant (avec traçabilité)
-- ============================================================

-- 1. Colonnes de traçabilité
ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS filled_by_admin UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS filled_by_admin_at TIMESTAMPTZ;

ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS fill_mode TEXT DEFAULT 'learner'
    CHECK (fill_mode IN ('learner', 'admin_for_learner', 'admin_paper'));

ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_qr_filled_by_admin
  ON questionnaire_responses(filled_by_admin)
  WHERE filled_by_admin IS NOT NULL;
