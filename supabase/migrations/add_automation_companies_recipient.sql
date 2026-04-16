-- ============================================================
-- Migration : Ajouter 'companies' comme recipient_type dans automation rules
-- ============================================================

-- Drop et recréer la contrainte pour ajouter 'companies'
ALTER TABLE formation_automation_rules DROP CONSTRAINT IF EXISTS formation_automation_rules_recipient_type_check;
ALTER TABLE formation_automation_rules ADD CONSTRAINT formation_automation_rules_recipient_type_check
  CHECK (recipient_type IN ('learners', 'trainers', 'all', 'companies'));
