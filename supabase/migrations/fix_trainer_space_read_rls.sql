-- ============================================================
-- Fix RLS prod : l'espace /trainer ne voyait AUCUNE session / donnée liée.
--
-- Cause (diagnostiquée le 2026-06-19, après fix_trainers_trainer_read_own) :
-- les policies des tables de l'espace formateur (formation_trainers, sessions,
-- trainings, enrollments, trainer_competencies) référencent des helpers
-- `auth.user_role()` / `auth.user_entity_id()` qui renvoient NULL en prod
-- → 0 ligne pour tout formateur (vérifié empiriquement : un formateur de test
-- assigné à une session réelle lisait 0 ligne de formation_trainers ET sessions).
--
-- Fix : helpers SECURITY DEFINER qui renvoient les ids du formateur courant
-- (bypass RLS dans les sous-requêtes, pas de récursion, indépendants des
-- helpers auth.* cassés) + policies SELECT additives, chacune limitée aux
-- DONNÉES PROPRES du formateur (ses assignations, ses sessions, etc.).
-- Additif : n'enlève aucun accès existant (admin/super_admin conservés).
--
-- À exécuter dans le SQL Editor du Dashboard Supabase (prod).
-- ============================================================

-- ── Helpers (SECURITY DEFINER : contournent RLS à l'intérieur) ──────────────
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

CREATE OR REPLACE FUNCTION public.current_trainer_training_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT DISTINCT s.training_id FROM public.sessions s
  WHERE s.id IN (SELECT public.current_trainer_session_ids())
    AND s.training_id IS NOT NULL
$$;

-- ── formation_trainers : le formateur lit SES assignations ──────────────────
DROP POLICY IF EXISTS "formation_trainers_trainer_read_own" ON formation_trainers;
CREATE POLICY "formation_trainers_trainer_read_own" ON formation_trainers
  FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT public.current_trainer_ids()));

-- ── sessions : le formateur lit les sessions auxquelles il est assigné ──────
DROP POLICY IF EXISTS "sessions_trainer_read_assigned" ON sessions;
CREATE POLICY "sessions_trainer_read_assigned" ON sessions
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_trainer_session_ids()));

-- ── trainings : le formateur lit les formations de ses sessions ─────────────
DROP POLICY IF EXISTS "trainings_trainer_read_assigned" ON trainings;
CREATE POLICY "trainings_trainer_read_assigned" ON trainings
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_trainer_training_ids()));

-- ── enrollments : le formateur lit les inscrits de ses sessions ─────────────
DROP POLICY IF EXISTS "enrollments_trainer_read_assigned" ON enrollments;
CREATE POLICY "enrollments_trainer_read_assigned" ON enrollments
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT public.current_trainer_session_ids()));

-- ── trainer_competencies : le formateur lit ses propres compétences ─────────
DROP POLICY IF EXISTS "trainer_competencies_trainer_read_own" ON trainer_competencies;
CREATE POLICY "trainer_competencies_trainer_read_own" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT public.current_trainer_ids()));
