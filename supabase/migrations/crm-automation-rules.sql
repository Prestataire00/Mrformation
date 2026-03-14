-- CRM Automation Rules table
CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'quote_all_accepted', 'quote_all_rejected', 'quote_created_for_new',
    'prospect_inactive_30d', 'quote_expiring_3d', 'prospect_created',
    'prospect_qualified', 'task_overdue_3d', 'daily_digest', 'weekly_summary',
    'recalculate_scores'
  )),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'update_prospect_status', 'create_task', 'create_notification', 'update_scores'
  )),
  is_enabled BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_automation_rules_admin" ON crm_automation_rules
  FOR ALL TO authenticated
  USING (true);

-- Seed default automation rules (will be created per-entity on first load)
-- These are template definitions; the automations page seeds them if none exist.
