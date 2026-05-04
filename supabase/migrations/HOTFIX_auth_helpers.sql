-- ============================================================
-- HOTFIX : créer auth.user_role() et auth.user_entity_id() si manquants
-- ============================================================
-- Symptôme client : "Documents -> Détail : il n'y a plus les documents
-- attribués automatiquement" après application du cleanup RLS.
--
-- Cause racine : les policies legacy (rls-granular.sql) sur sessions,
-- learners, clients, etc. utilisent auth.user_role() / auth.user_entity_id().
-- Si ces fonctions n'existent pas dans le schéma auth (Supabase hébergé peut
-- les avoir perdues, ou elles n'ont jamais été créées), les policies
-- retournent NULL → admin ne peut plus rien voir.
--
-- Fix : créer les deux fonctions dans le schéma auth pour matcher les
-- policies existantes. Si elles existent déjà, CREATE OR REPLACE est no-op.
--
-- ⚠️ À EXÉCUTER DANS SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION auth.user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.user_entity_id() TO authenticated, anon;

-- Vérification : doit retourner ton rôle (super_admin, admin, etc.)
-- SELECT auth.user_role(), auth.user_entity_id();
