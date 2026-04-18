-- ============================================================
-- Migration : Convocation minimum 15 jours (Art. L6353-8)
-- ============================================================

-- Ajouter colonne pour validation minimum
ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS min_days_offset INTEGER;

-- Forcer 15 jours minimum sur les convocations existantes
UPDATE formation_automation_rules
SET days_offset = GREATEST(days_offset, 15),
    min_days_offset = 15
WHERE document_type = 'convocation'
  AND trigger_type = 'session_start_minus_days'
  AND (days_offset < 15 OR min_days_offset IS NULL);
