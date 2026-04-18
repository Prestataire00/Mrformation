-- ============================================================
-- Migration : Module amélioration continue (Qualiopi C7 ind. 30)
-- ============================================================

CREATE TABLE IF NOT EXISTS improvement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_type TEXT CHECK (source_type IN ('questionnaire', 'complaint', 'audit', 'internal', 'stagiaire', 'client')),
  source_id UUID,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'identified' CHECK (status IN ('identified', 'planned', 'in_progress', 'implemented', 'verified', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date DATE,
  implemented_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  impact_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_improvement_actions_entity ON improvement_actions(entity_id);
CREATE INDEX IF NOT EXISTS idx_improvement_actions_status ON improvement_actions(status);

ALTER TABLE improvement_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "improvement_actions_entity_access" ON improvement_actions
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));
