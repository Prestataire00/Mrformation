-- ============================================================
-- Migration: Ajouter la table crm_commercial_actions
-- Journal des actions commerciales (appels, emails, RDV,
-- commentaires, relances, changements de statut, devis…)
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_commercial_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'call', 'email', 'meeting', 'comment', 'status_change',
    'quote_sent', 'quote_accepted', 'quote_rejected',
    'task_created', 'document_sent', 'relance'
  )),
  subject TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Index ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_commercial_actions_entity_created
  ON crm_commercial_actions (entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commercial_actions_prospect
  ON crm_commercial_actions (prospect_id);

CREATE INDEX IF NOT EXISTS idx_commercial_actions_type
  ON crm_commercial_actions (action_type);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE crm_commercial_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'crm_commercial_actions_admin_all'
  ) THEN
    CREATE POLICY "crm_commercial_actions_admin_all" ON crm_commercial_actions
      FOR ALL TO authenticated
      USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
        AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
      )
      WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
        AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;
