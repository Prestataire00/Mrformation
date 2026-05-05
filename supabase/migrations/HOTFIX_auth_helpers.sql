-- ============================================================
-- HOTFIX v2 : super_admin RLS policies (le schéma auth est verrouillé
-- sur Supabase hébergé, on travaille uniquement en public)
-- ============================================================
-- Symptôme client : après cleanup RLS, super_admin ne voit plus les docs
-- auto, sessions, learners, trainers, etc.
--
-- CAUSE : 48 policies legacy (rls-granular.sql) checkent
-- `auth.user_role() = 'admin'`. Un user 'super_admin' échoue ce check.
-- On NE PEUT PAS modifier auth.user_role() (permission denied).
--
-- FIX : on ajoute des policies PERMISSIVES (additionnelles) sur les tables
-- critiques pour autoriser super_admin via `public.user_role()`. PostgreSQL
-- combine les policies en OR : si N'IMPORTE laquelle accepte, accès accordé.
-- → super_admin passe via la nouvelle, admin via legacy ou nouvelle, autres
--   rôles inchangés.
--
-- ⚠️ À EXÉCUTER DANS SUPABASE SQL EDITOR
-- ============================================================

-- ── 1. Helpers public (idempotent) ──────────────────────────
-- public.user_role() peut être appelé sans schéma — search_path le résout.

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_entity_id() TO authenticated, anon;

-- ── 2. Policies super_admin sur les tables legacy ──────────
-- Pattern : DROP IF EXISTS puis CREATE pour idempotence.
-- super_admin a accès à TOUTES les entités (cross-tenant), donc pas de
-- filtre entity_id. Les autres rôles passent par les policies existantes.

-- profiles : super_admin lit/écrit tout (gère les comptes)
DROP POLICY IF EXISTS "profiles_super_admin_all" ON profiles;
CREATE POLICY "profiles_super_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');

-- entities : super_admin gère
DROP POLICY IF EXISTS "entities_super_admin_all" ON entities;
CREATE POLICY "entities_super_admin_all" ON entities
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');

-- Tables avec entity_id direct : super_admin = cross-entity
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'sessions', 'clients', 'learners', 'trainers', 'programs',
    'document_templates', 'email_history', 'email_templates',
    'crm_campaigns', 'crm_notifications', 'crm_prospects', 'crm_tags',
    'crm_tasks', 'crm_quotes', 'activity_log', 'quality_scores'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_super_admin_all" ON %1$s', tbl);
    EXECUTE format(
      'CREATE POLICY "%1$s_super_admin_all" ON %1$s
        FOR ALL TO authenticated
        USING (public.user_role() = %2$L)
        WITH CHECK (public.user_role() = %2$L)',
      tbl, 'super_admin'
    );
  END LOOP;
END $$;

-- Tables sans entity_id direct (relations) : super_admin via parent tables
-- (super_admin a accès cross-entity de toute façon)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'contacts', 'enrollments', 'questionnaire_sessions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_super_admin_all" ON %1$s', tbl);
    EXECUTE format(
      'CREATE POLICY "%1$s_super_admin_all" ON %1$s
        FOR ALL TO authenticated
        USING (public.user_role() = %2$L)
        WITH CHECK (public.user_role() = %2$L)',
      tbl, 'super_admin'
    );
  END LOOP;
END $$;

-- ── 3. Vérification ─────────────────────────────────────────
-- Doit retourner 'super_admin' (ou 'admin' selon ton compte) :
--   SELECT public.user_role();
--
-- Doit lister les nouvelles policies super_admin :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE policyname LIKE '%super_admin_all'
--   ORDER BY tablename;
