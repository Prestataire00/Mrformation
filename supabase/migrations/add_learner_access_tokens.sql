-- ============================================================
-- Migration : Magic links apprenants
-- ============================================================

CREATE TABLE IF NOT EXISTS learner_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  purpose TEXT DEFAULT 'access' CHECK (purpose IN ('access', 'questionnaire', 'document', 'emargement')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learner_tokens_token ON learner_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_learner_tokens_learner ON learner_access_tokens(learner_id);

ALTER TABLE learner_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learner_tokens_admin" ON learner_access_tokens
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- Lecture publique par token (pour la page /access/[token])
CREATE POLICY "learner_tokens_public_read" ON learner_access_tokens
  FOR SELECT TO anon
  USING (true);
