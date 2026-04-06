-- ============================================================
-- Migration : Gestion des prises en charge OPCO
-- Enrichissement financeurs + liaison + workflow
-- Date : 2026-04-06
-- ============================================================

-- ═══ ÉTAPE 1 : Enrichir la table financeurs (master) ═══

ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS code_opco TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE financeurs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ═══ ÉTAPE 2 : Enrichir formation_financiers (par session) ═══

ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS financeur_id UUID REFERENCES financeurs(id) ON DELETE SET NULL;

ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'a_deposer'
  CHECK (status IN ('a_deposer', 'deposee', 'en_cours', 'acceptee', 'refusee', 'partielle'));

ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS accord_number TEXT;
ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS amount_requested DECIMAL(10,2);
ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS amount_granted DECIMAL(10,2);
ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS deposit_date DATE;
ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS response_date DATE;
ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS documents_url TEXT;
ALTER TABLE formation_financiers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index pour le suivi OPCO
CREATE INDEX IF NOT EXISTS idx_formation_financiers_status
ON formation_financiers(status);

CREATE INDEX IF NOT EXISTS idx_formation_financiers_financeur
ON formation_financiers(financeur_id);

-- ═══ ÉTAPE 5 : Nouveau trigger automation OPCO ═══

ALTER TABLE formation_automation_rules
DROP CONSTRAINT IF EXISTS formation_automation_rules_trigger_type_check;

ALTER TABLE formation_automation_rules
ADD CONSTRAINT formation_automation_rules_trigger_type_check
CHECK (trigger_type IN (
  'session_start_minus_days',
  'session_end_plus_days',
  'on_session_creation',
  'on_session_completion',
  'opco_deposit_reminder'
));
