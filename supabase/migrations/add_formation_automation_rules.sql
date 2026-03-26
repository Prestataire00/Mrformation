-- Formation Automation Rules table
-- Distinct from crm_automation_rules: handles document/email automation
-- triggered relative to session start/end dates.

CREATE TABLE IF NOT EXISTS formation_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'session_start_minus_days',
    'session_end_plus_days'
  )),
  document_type TEXT NOT NULL,
  days_offset INTEGER NOT NULL DEFAULT 5,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE formation_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON formation_automation_rules
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_formation_automation_rules_entity
  ON formation_automation_rules (entity_id);
