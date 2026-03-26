-- ============================================================
-- Migration: Vue liste prospects CRM
-- Ajoute la table prospect_comments, le champ reminder_at
-- sur crm_tasks, et étend email_history.recipient_type
-- ============================================================

-- ── Table prospect_comments ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prospect_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_comments_prospect ON prospect_comments(prospect_id);

ALTER TABLE prospect_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospect_comments_admin_all" ON prospect_comments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── Ajout reminder_at sur crm_tasks ──────────────────────────────────────────

ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;

-- ── Étendre recipient_type pour supporter 'prospect' ─────────────────────────

ALTER TABLE email_history DROP CONSTRAINT IF EXISTS email_history_recipient_type_check;
ALTER TABLE email_history ADD CONSTRAINT email_history_recipient_type_check
  CHECK (recipient_type IN ('learner', 'trainer', 'client', 'financier', 'manager', 'prospect'));
