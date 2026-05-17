-- ============================================================
-- Fix RLS infinite recursion (Postgres 42P17) sur enrollments + sessions
-- ============================================================
-- Symptôme : /learner/my-trainings, /learner/calendar et toute query
-- nested learners → enrollments → sessions plantait en HTTP 500 avec
-- le message "infinite recursion detected in policy for relation enrollments".
--
-- Cause :
--   - enrollments_learner_read fait : learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
--   - sessions_learner_read fait : id IN (SELECT e.session_id FROM enrollments e JOIN learners l ...)
--   - Quand Postgres évalue ces sub-selects, il ré-applique les policies sur
--     learners (qui peuvent elles-mêmes faire des sub-selects sur enrollments).
--     Avec la query nested 3 niveaux, ça boucle.
--
-- Fix : encapsuler la logique d'appartenance dans 2 fonctions SECURITY
-- DEFINER qui bypass les RLS et donc cassent la récursion.
-- ============================================================

-- 1. Helper : true si _learner_id appartient au user courant
CREATE OR REPLACE FUNCTION public.is_my_learner_id(_learner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM learners
    WHERE id = _learner_id
      AND profile_id = auth.uid()
  );
$$;

-- 2. Helper : true si _session_id contient une inscription du user courant
CREATE OR REPLACE FUNCTION public.is_my_session_id(_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    JOIN learners l ON l.id = e.learner_id
    WHERE e.session_id = _session_id
      AND l.profile_id = auth.uid()
  );
$$;

-- 3. Drop les 2 policies récursives
DROP POLICY IF EXISTS enrollments_learner_read ON enrollments;
DROP POLICY IF EXISTS sessions_learner_read ON sessions;

-- 4. Recréer enrollments_learner_read via fonction (plus de récursion)
CREATE POLICY enrollments_learner_read ON enrollments
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND public.is_my_learner_id(learner_id)
  );

-- 5. Recréer sessions_learner_read via fonction
CREATE POLICY sessions_learner_read ON sessions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND entity_id = public.user_entity_id()
    AND public.is_my_session_id(id)
  );

-- ============================================================
-- Vérifications post-exécution :
--   SELECT polname FROM pg_policies
--     WHERE polname IN ('enrollments_learner_read', 'sessions_learner_read');
--   -- (doit retourner les 2 lignes)
--
--   SELECT proname FROM pg_proc
--     WHERE proname IN ('is_my_learner_id', 'is_my_session_id');
--   -- (doit retourner les 2 lignes)
--
-- Validation fonctionnelle :
--   - Connecté en apprenant : /learner/my-trainings doit afficher les formations
--   - Console DevTools ne doit plus afficher d'erreur 500 ni "infinite recursion"
-- ============================================================
