-- ============================================================
-- HOTFIX : helpers auth.user_role / auth.user_entity_id
-- + super_admin reconnu comme admin par les policies legacy
-- ============================================================
-- Symptôme client : après le cleanup RLS, plein de docs et tables ne
-- s'affichent plus côté super_admin (Documents auto, sessions, etc.).
--
-- CAUSE :
--   Les policies legacy (rls-granular.sql) sur sessions, clients, learners,
--   trainers, document_templates utilisent `auth.user_role() = 'admin'`.
--   Un user 'super_admin' ne passe PAS ce check ('super_admin' ≠ 'admin').
--   Les nouvelles policies du cleanup utilisent `IN ('admin','super_admin')`
--   donc fonctionnent. Mais les legacy policies sur les 19 tables du phase2A
--   refusent l'accès au super_admin.
--
-- FIX :
--   On fait que `auth.user_role()` retourne 'admin' quand le rôle réel est
--   'super_admin'. Justification : dans cette app, super_admin a TOUS les
--   pouvoirs admin (et plus). Aucune policy ne distingue super_admin d'admin
--   → l'alias est sémantiquement correct.
--
--   Code applicatif inchangé : il lit `profile.role` directement, pas via
--   auth.user_role(). Les policies de cleanup utilisent IN, donc continuent
--   à fonctionner avec ce nouveau comportement.
--
-- ⚠️ À EXÉCUTER DANS SUPABASE SQL EDITOR
-- ============================================================

-- auth.user_role() : alias super_admin → admin pour compat legacy
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT CASE
    WHEN role = 'super_admin' THEN 'admin'
    ELSE role
  END
  FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Idem pour public.user_role() pour cohérence (cleanup policies utilisent IN
-- donc super_admin passait déjà — mais on uniformise les deux fonctions)
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT CASE
    WHEN role = 'super_admin' THEN 'admin'
    ELSE role
  END
  FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION auth.user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.user_entity_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_entity_id() TO authenticated, anon;

-- Vérification : doit retourner 'admin' (même si tu es super_admin)
-- SELECT auth.user_role(), public.user_role(), auth.user_entity_id();
