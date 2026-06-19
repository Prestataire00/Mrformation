-- ============================================================
-- Fix RLS prod — un formateur ne voyait PAS ses apprenants inscrits.
--
-- L'espace /trainer charge les apprenants via le join enrollments→learners
-- (ex. page d'émargement). `enrollments` est lisible (fix_trainer_space_read_rls)
-- mais `learners` était bloqué par RLS pour le rôle trainer → le join renvoyait
-- des noms vides → « aucun apprenant visible ». Vérifié empiriquement :
-- formateur de test assigné à une session avec 5 inscrits → 0/6 noms visibles,
-- lecture directe de learners = 0 ligne.
--
-- Fix : un formateur lit les apprenants INSCRITS à SES sessions (et seulement
-- ceux-là). Helper SECURITY DEFINER pour éviter le RLS imbriqué.
-- Réutilise current_trainer_session_ids() (créé par fix_trainer_space_read_rls.sql).
--
-- À exécuter dans le SQL Editor du Dashboard Supabase (prod).
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_trainer_learner_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT DISTINCT e.learner_id FROM public.enrollments e
  WHERE e.session_id IN (SELECT public.current_trainer_session_ids())
$$;

DROP POLICY IF EXISTS "learners_trainer_read_enrolled" ON learners;
CREATE POLICY "learners_trainer_read_enrolled" ON learners
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_trainer_learner_ids()));
