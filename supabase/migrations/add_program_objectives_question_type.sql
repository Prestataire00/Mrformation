-- ============================================================
-- Migration : Type de question "program_objectives" (balise dynamique)
-- ============================================================
-- Permet à l'admin de créer un questionnaire "avant" / "après" formation
-- avec une balise unique qui sera remplacée à la distribution par N questions
-- de notation 1-5, une par objectif du programme de la formation.
--
-- Résultat : 1 questionnaire template = utilisable pour toutes les formations,
-- les questions s'adaptent automatiquement aux objectifs de chaque programme.
-- ============================================================

-- Drop the old CHECK constraint and add a new one with program_objectives
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('rating', 'text', 'multiple_choice', 'yes_no', 'program_objectives'));

-- ============================================================
-- Vérification :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'questions_type_check';
-- ============================================================
