-- Tokens publics pour questionnaires en présentiel (QR code sans auth)
-- Pattern identique à signing_tokens (émargement)

CREATE TABLE IF NOT EXISTS questionnaire_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id),
  used_at TIMESTAMPTZ,
  response_id UUID,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_tokens_token
  ON questionnaire_tokens(token) WHERE used_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_questionnaire_tokens_unique_active
  ON questionnaire_tokens (session_id, questionnaire_id, learner_id)
  WHERE used_at IS NULL;

ALTER TABLE questionnaire_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_questionnaire_tokens"
  ON questionnaire_tokens FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));
