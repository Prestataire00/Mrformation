-- ============================================================
-- Migration: questionnaires créés par le formateur (demande 5)
-- Ajoute l'auteur formateur + RLS write borné à ses propres créations.
-- ⚠️ Helpers RLS en public.* (PAS auth.*) — cf. mémoire projet.
-- ============================================================

-- 1. Colonne auteur (null = questionnaire admin)
ALTER TABLE questionnaires
  ADD COLUMN IF NOT EXISTS created_by_trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questionnaires_created_by_trainer
  ON questionnaires(created_by_trainer_id) WHERE created_by_trainer_id IS NOT NULL;

-- 2. RLS questionnaires : le formateur crée/édite/supprime SES propres questionnaires
DROP POLICY IF EXISTS "questionnaires_trainer_insert_own" ON questionnaires;
CREATE POLICY "questionnaires_trainer_insert_own" ON questionnaires
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'trainer'
    AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "questionnaires_trainer_update_own" ON questionnaires;
CREATE POLICY "questionnaires_trainer_update_own" ON questionnaires
  FOR UPDATE TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    public.user_role() = 'trainer'
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "questionnaires_trainer_delete_own" ON questionnaires;
CREATE POLICY "questionnaires_trainer_delete_own" ON questionnaires
  FOR DELETE TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- 3. RLS questions : le formateur gère les questions de SES questionnaires
DROP POLICY IF EXISTS "questions_trainer_manage_own" ON questions;
CREATE POLICY "questions_trainer_manage_own" ON questions
  FOR ALL TO authenticated
  USING (
    questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  )
  WITH CHECK (
    questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE created_by_trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  );

-- 4. RLS questionnaire_sessions : le formateur lie un questionnaire de SON entité
--    à une session qui lui est assignée (réutilisation autorisée à toute l'entité).
DROP POLICY IF EXISTS "qsessions_trainer_manage" ON questionnaire_sessions;
CREATE POLICY "qsessions_trainer_manage" ON questionnaire_sessions
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT session_id FROM formation_trainers
      WHERE trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  )
  WITH CHECK (
    questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
    AND session_id IN (
      SELECT session_id FROM formation_trainers
      WHERE trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
    )
  );

-- Vérif : SELECT column_name FROM information_schema.columns
--   WHERE table_name='questionnaires' AND column_name='created_by_trainer_id';  -- 1 ligne
