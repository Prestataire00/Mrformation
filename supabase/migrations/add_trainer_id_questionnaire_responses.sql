-- ============================================================
-- EF-3.4 — Questionnaires remplis par le FORMATEUR
-- ============================================================
-- Contexte : `questionnaire_responses` ne porte que `learner_id` (FK learners).
-- Or un formateur n'est pas un apprenant → impossible de stocker sa réponse.
-- On ajoute `trainer_id` (FK trainers) + une contrainte « pas les deux à la fois ».
--
-- ⚠️ Helpers RLS en `public.*` (PAS `auth.*`) — en prod les fonctions
--    user_role()/user_entity_id() vivent dans le schéma `public` ; schema.sql
--    est trompeur sur ce point. (Cf. note projet RLS helpers.)
--
-- Idempotent : ré-exécutable sans dommage.
-- À exécuter dans Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1. Colonne trainer_id
ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;

-- 2. Un enregistrement ne peut pas être attribué à la fois à un apprenant ET un
--    formateur (mais peut n'avoir ni l'un ni l'autre : legacy toléré).
ALTER TABLE questionnaire_responses
  DROP CONSTRAINT IF EXISTS questionnaire_responses_respondent_not_both;
ALTER TABLE questionnaire_responses
  ADD CONSTRAINT questionnaire_responses_respondent_not_both
  CHECK (NOT (learner_id IS NOT NULL AND trainer_id IS NOT NULL));

-- 3. Index pour les lectures par formateur
CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_trainer
  ON questionnaire_responses(trainer_id) WHERE trainer_id IS NOT NULL;

-- 4. RLS : le formateur insère / lit SES propres réponses (trainer_id = sa fiche).
DROP POLICY IF EXISTS "questionnaire_responses_trainer_self_insert" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_trainer_self_insert" ON questionnaire_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "questionnaire_responses_trainer_self_read" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_trainer_self_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- ============================================================
-- Vérifications post-migration (à lancer après) :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='questionnaire_responses' AND column_name='trainer_id';   -- 1 ligne
--   SELECT conname FROM pg_constraint
--   WHERE conname='questionnaire_responses_respondent_not_both';               -- 1 ligne
-- ============================================================
