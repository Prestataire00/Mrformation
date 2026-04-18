-- ============================================================
-- Migration : Condition sous-traitance sur les règles d'automatisation
-- ============================================================

ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS condition_subcontracted BOOLEAN DEFAULT NULL;
-- NULL = toujours exécuter, true = seulement si sous-traitance, false = seulement si pas sous-traitance

-- Contact automatisation sur les clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS automation_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
