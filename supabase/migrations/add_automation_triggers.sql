-- ============================================================
-- Migration : Nouveaux triggers d'automatisation
-- on_session_creation + on_session_completion
-- Date : 2026-04-04
-- ============================================================

ALTER TABLE formation_automation_rules
DROP CONSTRAINT IF EXISTS formation_automation_rules_trigger_type_check;

ALTER TABLE formation_automation_rules
ADD CONSTRAINT formation_automation_rules_trigger_type_check
CHECK (trigger_type IN (
  'session_start_minus_days',
  'session_end_plus_days',
  'on_session_creation',
  'on_session_completion'
));
