-- ============================================================
-- Migration: Onglet 10 (Satisfaction & Qualité) — attributions questionnaires satisfaction
-- ============================================================

CREATE TABLE IF NOT EXISTS formation_satisfaction_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  satisfaction_type TEXT NOT NULL CHECK (satisfaction_type IN (
    'satisfaction_chaud', 'satisfaction_froid',
    'quest_financeurs', 'quest_formateurs', 'quest_managers',
    'quest_entreprises', 'autres_quest'
  )),
  -- target_type: qui est ciblé par ce questionnaire
  target_type TEXT NOT NULL CHECK (target_type IN (
    'learner', 'trainer', 'manager', 'financier', 'company'
  )),
  -- target_id: NULL = attribution en masse (tous les acteurs du type), sinon ID spécifique
  target_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, satisfaction_type, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_fsa_session ON formation_satisfaction_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_fsa_target ON formation_satisfaction_assignments(session_id, target_type, target_id);

ALTER TABLE formation_satisfaction_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsa_entity_access" ON formation_satisfaction_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
      AND p.id = auth.uid()
    )
  );
