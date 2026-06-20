-- ============================================================
-- Fix RLS prod — espace APPRENANT (/learner) : mêmes cassures que l'espace
-- formateur. Le rôle `learner` ne peut pas lire plusieurs tables nécessaires
-- (policies strictes basées sur helpers auth.* renvoyant NULL en prod).
--
-- Diagnostiqué empiriquement le 2026-06-19/20 (apprenant de test inscrit à une
-- vraie session, lecture sous clé anon) :
--   - LISIBLE (OK) : learners (sa fiche), enrollments, sessions,
--     formation_time_slots, documents, entities → le calendrier fonctionne.
--   - BLOQUÉ pour `learner` : trainings, trainers, programs, program_enrollments,
--     elearning_courses, elearning_enrollments, formation_elearning_assignments,
--     questionnaire_sessions, questionnaires, questions, questionnaire_responses,
--     document_templates → Mes formations (Parcours), Cours e-learning,
--     Questionnaires, Contacts (formateur), libellés formation/formateur du
--     calendrier, contenu des documents.
--
-- Fix : helpers SECURITY DEFINER (contournent le RLS imbriqué) renvoyant les
-- ids propres de l'apprenant courant + policies SELECT additives, scopées aux
-- données propres de l'apprenant (ses sessions / ses inscriptions / son entité).
-- Additif : n'enlève aucun accès existant (admin/super_admin conservés).
--
-- À exécuter dans le SQL Editor du Dashboard Supabase (prod).
-- ============================================================

-- ── Helpers (idempotents ; SECURITY DEFINER = bypass RLS interne) ───────────
CREATE OR REPLACE FUNCTION public.current_entity_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_learner_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT id FROM public.learners WHERE profile_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_learner_session_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT e.session_id FROM public.enrollments e
  WHERE e.learner_id IN (SELECT public.current_learner_ids())
$$;

CREATE OR REPLACE FUNCTION public.current_learner_training_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT DISTINCT s.training_id FROM public.sessions s
  WHERE s.id IN (SELECT public.current_learner_session_ids())
    AND s.training_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.current_learner_trainer_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT ft.trainer_id FROM public.formation_trainers ft
  WHERE ft.session_id IN (SELECT public.current_learner_session_ids())
  UNION
  SELECT s.trainer_id FROM public.sessions s
  WHERE s.id IN (SELECT public.current_learner_session_ids())
    AND s.trainer_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.current_entity_questionnaire_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT id FROM public.questionnaires WHERE entity_id = public.current_entity_id()
$$;

-- ── trainings : formations de ses sessions (libellé calendrier / Mes formations)
DROP POLICY IF EXISTS "trainings_learner_read" ON trainings;
CREATE POLICY "trainings_learner_read" ON trainings
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_learner_training_ids()));

-- ── trainers : formateurs de ses sessions (calendrier / Contacts) ───────────
DROP POLICY IF EXISTS "trainers_learner_read" ON trainers;
CREATE POLICY "trainers_learner_read" ON trainers
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_learner_trainer_ids()));

-- ── programs : catalogue des programmes de son entité (page Cours / Parcours) ─
DROP POLICY IF EXISTS "programs_learner_read_entity" ON programs;
CREATE POLICY "programs_learner_read_entity" ON programs
  FOR SELECT TO authenticated
  USING (entity_id = public.current_entity_id());

-- ── program_enrollments : ses inscriptions parcours ─────────────────────────
DROP POLICY IF EXISTS "program_enrollments_learner_read_own" ON program_enrollments;
CREATE POLICY "program_enrollments_learner_read_own" ON program_enrollments
  FOR SELECT TO authenticated
  USING (learner_id IN (SELECT public.current_learner_ids()));

-- ── elearning_courses : catalogue e-learning de son entité ──────────────────
DROP POLICY IF EXISTS "elearning_courses_learner_read_entity" ON elearning_courses;
CREATE POLICY "elearning_courses_learner_read_entity" ON elearning_courses
  FOR SELECT TO authenticated
  USING (entity_id = public.current_entity_id());

-- ── elearning_enrollments : ses inscriptions e-learning ─────────────────────
DROP POLICY IF EXISTS "elearning_enrollments_learner_read_own" ON elearning_enrollments;
CREATE POLICY "elearning_enrollments_learner_read_own" ON elearning_enrollments
  FOR SELECT TO authenticated
  USING (learner_id IN (SELECT public.current_learner_ids()));

-- ── formation_elearning_assignments : ses affectations e-learning ───────────
DROP POLICY IF EXISTS "fea_learner_read_own" ON formation_elearning_assignments;
CREATE POLICY "fea_learner_read_own" ON formation_elearning_assignments
  FOR SELECT TO authenticated
  USING (learner_id IN (SELECT public.current_learner_ids()));

-- ── questionnaire_sessions : liens questionnaire↔session de ses sessions ────
DROP POLICY IF EXISTS "questionnaire_sessions_learner_read" ON questionnaire_sessions;
CREATE POLICY "questionnaire_sessions_learner_read" ON questionnaire_sessions
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT public.current_learner_session_ids()));

-- ── questionnaires : questionnaires de son entité ───────────────────────────
DROP POLICY IF EXISTS "questionnaires_learner_read_entity" ON questionnaires;
CREATE POLICY "questionnaires_learner_read_entity" ON questionnaires
  FOR SELECT TO authenticated
  USING (entity_id = public.current_entity_id());

-- ── questions : questions des questionnaires de son entité ──────────────────
DROP POLICY IF EXISTS "questions_learner_read_entity" ON questions;
CREATE POLICY "questions_learner_read_entity" ON questions
  FOR SELECT TO authenticated
  USING (questionnaire_id IN (SELECT public.current_entity_questionnaire_ids()));

-- ── questionnaire_responses : lecture + écriture de SES réponses ────────────
DROP POLICY IF EXISTS "questionnaire_responses_learner_read_own" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_learner_read_own" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (learner_id IN (SELECT public.current_learner_ids()));

DROP POLICY IF EXISTS "questionnaire_responses_learner_insert_own" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_learner_insert_own" ON questionnaire_responses
  FOR INSERT TO authenticated
  WITH CHECK (learner_id IN (SELECT public.current_learner_ids()));

-- ── document_templates : modèles de son entité (contenu des documents) ──────
DROP POLICY IF EXISTS "document_templates_learner_read_entity" ON document_templates;
CREATE POLICY "document_templates_learner_read_entity" ON document_templates
  FOR SELECT TO authenticated
  USING (entity_id = public.current_entity_id());
