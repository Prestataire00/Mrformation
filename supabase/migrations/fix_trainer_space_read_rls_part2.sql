-- ============================================================
-- Fix RLS prod — espace formateur, COMPLÉMENT (partie 2).
--
-- Suite de fix_trainers_trainer_read_own.sql (fiche) et
-- fix_trainer_space_read_rls.sql (sessions/assignations/formations/inscrits/
-- compétences). Couvre TOUT le reste de l'espace /trainer côté pédagogique :
-- évaluations, questionnaires, contrats/documents, créneaux, émargements, et
-- l'édition du profil. Même cause : policies basées sur helpers auth.* (NULL
-- en prod). Toutes les policies ci-dessous sont ADDITIVES et limitées aux
-- données propres du formateur (ses sessions / ses réponses / son entité).
--
-- Périmètre exclu volontairement : "Mes Tâches" (crm_tasks / crm_prospects /
-- clients) — l'accès CRM d'un formateur est une décision de confidentialité
-- distincte (exposer prospects/clients à un formateur). À traiter à part.
--
-- À exécuter dans le SQL Editor du Dashboard Supabase (prod).
-- ============================================================

-- ── Helpers (idempotents ; SECURITY DEFINER = bypass RLS interne) ───────────
CREATE OR REPLACE FUNCTION public.current_trainer_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT id FROM public.trainers WHERE profile_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_trainer_session_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT ft.session_id FROM public.formation_trainers ft
  WHERE ft.trainer_id IN (SELECT public.current_trainer_ids())
$$;

CREATE OR REPLACE FUNCTION public.current_entity_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_entity_questionnaire_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT id FROM public.questionnaires WHERE entity_id = public.current_entity_id()
$$;

-- ── trainers : le formateur MODIFIE sa propre fiche (page Mon Profil) ───────
DROP POLICY IF EXISTS "trainers_trainer_update_own" ON trainers;
CREATE POLICY "trainers_trainer_update_own" ON trainers
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ── questionnaires : lecture des questionnaires de son entité ───────────────
DROP POLICY IF EXISTS "questionnaires_trainer_read_entity" ON questionnaires;
CREATE POLICY "questionnaires_trainer_read_entity" ON questionnaires
  FOR SELECT TO authenticated
  USING (entity_id = public.current_entity_id());

-- ── questions : lecture des questions des questionnaires de son entité ──────
DROP POLICY IF EXISTS "questions_trainer_read_entity" ON questions;
CREATE POLICY "questions_trainer_read_entity" ON questions
  FOR SELECT TO authenticated
  USING (questionnaire_id IN (SELECT public.current_entity_questionnaire_ids()));

-- ── questionnaire_responses : lecture (siennes ou de ses sessions) + écriture
DROP POLICY IF EXISTS "questionnaire_responses_trainer_read" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_trainer_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    trainer_id IN (SELECT public.current_trainer_ids())
    OR session_id IN (SELECT public.current_trainer_session_ids())
  );

DROP POLICY IF EXISTS "questionnaire_responses_trainer_insert_own" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_trainer_insert_own" ON questionnaire_responses
  FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN (SELECT public.current_trainer_ids()));

-- ── formation_satisfaction_assignments : ses affectations / ses sessions ────
DROP POLICY IF EXISTS "fsa_trainer_read" ON formation_satisfaction_assignments;
CREATE POLICY "fsa_trainer_read" ON formation_satisfaction_assignments
  FOR SELECT TO authenticated
  USING (
    (target_type = 'trainer' AND target_id IN (SELECT public.current_trainer_ids()))
    OR session_id IN (SELECT public.current_trainer_session_ids())
  );

-- ── generated_documents : documents (contrats…) de ses sessions ────────────
DROP POLICY IF EXISTS "generated_documents_trainer_read" ON generated_documents;
CREATE POLICY "generated_documents_trainer_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT public.current_trainer_session_ids()));

-- ── formation_time_slots : créneaux de ses sessions (émargement) ────────────
DROP POLICY IF EXISTS "formation_time_slots_trainer_read" ON formation_time_slots;
CREATE POLICY "formation_time_slots_trainer_read" ON formation_time_slots
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT public.current_trainer_session_ids()));

-- ── signatures : émargements de ses sessions (lecture) ──────────────────────
DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT public.current_trainer_session_ids()));
