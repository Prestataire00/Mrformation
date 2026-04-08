-- Add prospect_dormant and prospect_inactive notification types
-- Also fixes missing task_reminder type in CHECK constraint

ALTER TABLE crm_notifications DROP CONSTRAINT IF EXISTS crm_notifications_type_check;
ALTER TABLE crm_notifications ADD CONSTRAINT crm_notifications_type_check
  CHECK (type IN (
    'task_overdue', 'task_due_today', 'task_due_soon', 'task_reminder',
    'quote_followup', 'quote_expiring',
    'general',
    'prospect_won', 'prospect_dormant', 'prospect_inactive',
    'quote_accepted', 'quote_rejected',
    'daily_digest', 'weekly_summary'
  ));
