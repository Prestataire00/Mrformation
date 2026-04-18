-- ============================================================
-- Migration : Système d'automatisation étendu
-- Triggers enrichis + overrides par session + logs + CRM
-- ============================================================

-- 1. Élargir les triggers formation
ALTER TABLE formation_automation_rules
DROP CONSTRAINT IF EXISTS formation_automation_rules_trigger_type_check;

ALTER TABLE formation_automation_rules
ADD CONSTRAINT formation_automation_rules_trigger_type_check
CHECK (trigger_type IN (
  'session_start_minus_days',
  'session_end_plus_days',
  'on_session_creation',
  'on_session_completion',
  'on_enrollment',
  'on_signature_complete',
  'opco_deposit_reminder',
  'invoice_overdue',
  'questionnaire_reminder',
  'certificate_ready'
));

ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE formation_automation_rules ADD COLUMN IF NOT EXISTS document_types TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migrer document_type existant vers document_types[]
UPDATE formation_automation_rules
SET document_types = ARRAY[document_type]
WHERE document_type IS NOT NULL
  AND (document_types IS NULL OR document_types = ARRAY[]::TEXT[]);

-- 2. Overrides par session
CREATE TABLE IF NOT EXISTS session_automation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES formation_automation_rules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT TRUE,
  days_offset_override INTEGER,
  template_id_override UUID,
  recipient_type_override TEXT,
  custom_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, rule_id)
);

ALTER TABLE session_automation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_auto_overrides_entity" ON session_automation_overrides
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN profiles p ON p.entity_id = s.entity_id
    WHERE s.id = session_automation_overrides.session_id AND p.id = auth.uid()
  ));

-- 3. Historique d'exécution par session
CREATE TABLE IF NOT EXISTS session_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES formation_automation_rules(id) ON DELETE SET NULL,
  rule_name TEXT,
  trigger_type TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  recipient_count INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('success', 'partial', 'failed', 'skipped', 'test')),
  details JSONB,
  executed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_manual BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_session_auto_logs_session ON session_automation_logs(session_id);

ALTER TABLE session_automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_auto_logs_read" ON session_automation_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN profiles p ON p.entity_id = s.entity_id
    WHERE s.id = session_automation_logs.session_id AND p.id = auth.uid()
  ));

CREATE POLICY "session_auto_logs_insert" ON session_automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 4. Étendre triggers CRM
ALTER TABLE crm_automation_rules
DROP CONSTRAINT IF EXISTS crm_automation_rules_trigger_type_check;

ALTER TABLE crm_automation_rules
ADD CONSTRAINT crm_automation_rules_trigger_type_check
CHECK (trigger_type IN (
  'quote_all_accepted', 'quote_all_rejected', 'quote_created_for_new',
  'prospect_inactive_30d', 'quote_expiring_3d', 'prospect_created',
  'prospect_qualified', 'task_overdue_3d', 'daily_digest', 'weekly_summary',
  'recalculate_scores', 'quote_signed', 'client_created', 'invoice_paid'
));

ALTER TABLE crm_automation_rules
DROP CONSTRAINT IF EXISTS crm_automation_rules_action_type_check;

ALTER TABLE crm_automation_rules
ADD CONSTRAINT crm_automation_rules_action_type_check
CHECK (action_type IN (
  'update_prospect_status', 'create_task', 'create_notification',
  'update_scores', 'send_email', 'assign_user'
));
