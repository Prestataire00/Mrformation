-- Extend crm_notifications type CHECK to include new automation notification types
ALTER TABLE crm_notifications DROP CONSTRAINT IF EXISTS crm_notifications_type_check;
ALTER TABLE crm_notifications ADD CONSTRAINT crm_notifications_type_check
  CHECK (type IN (
    'task_overdue', 'task_due_today', 'task_due_soon',
    'quote_followup', 'quote_expiring',
    'general',
    'prospect_won', 'quote_accepted', 'quote_rejected',
    'daily_digest', 'weekly_summary'
  ));
