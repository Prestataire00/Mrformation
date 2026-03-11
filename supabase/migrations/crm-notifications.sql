-- Migration: CRM Notifications system for task reminders and quote follow-ups

CREATE TABLE IF NOT EXISTS crm_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task_overdue', 'task_due_today', 'task_due_soon', 'quote_followup', 'quote_expiring', 'general')),
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  resource_type TEXT,
  resource_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users see own notifications" ON crm_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications" ON crm_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Auth users insert notifications" ON crm_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users delete own notifications" ON crm_notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_crm_notifications_user_unread ON crm_notifications(user_id, is_read) WHERE is_read = FALSE;
