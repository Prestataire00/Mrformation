-- ============================================================
-- Migration: Onglet 9 (Évaluation) — attributions évaluations par formation
-- ============================================================

CREATE TABLE IF NOT EXISTS formation_evaluation_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  evaluation_type TEXT NOT NULL CHECK (evaluation_type IN (
    'eval_preformation', 'eval_pendant', 'eval_postformation',
    'auto_eval_pre', 'auto_eval_post'
  )),
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  -- learner_id NULL = attribution en masse (tous les apprenants)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, evaluation_type, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_fea_session ON formation_evaluation_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_fea_learner ON formation_evaluation_assignments(session_id, learner_id);

ALTER TABLE formation_evaluation_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fea_entity_access" ON formation_evaluation_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
      AND p.id = auth.uid()
    )
  );
