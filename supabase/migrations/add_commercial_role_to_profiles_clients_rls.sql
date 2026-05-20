-- ============================================================
-- Migration : Accès commerciaux — profiles & clients (Epic H, suite h-17)
-- ============================================================
--
-- CONTEXTE — bug détecté à l'audit des comptes commerciaux :
-- `add_commercial_role_to_crm_rls.sql` (h-17) a étendu les 9 tables CRM
-- core au rôle 'commercial', MAIS deux tables hors périmètre CRM restent
-- bloquées pour ce rôle et cassent des fonctionnalités :
--
--   1. profiles : la policy `profiles_admin_read` ne couvre que
--      'admin'/'super_admin'. Un commercial ne lit que SA propre ligne
--      (`profiles_self_read`). Conséquence : les menus déroulants
--      d'assignation (tasks/page.tsx fetchProfiles, prospects/page.tsx
--      teamMembers) ne montrent que le commercial lui-même, et les
--      jointures `assignee:profiles!...fkey` renvoient null pour les
--      records assignés à un autre. → L'attribution est inutilisable.
--      (Le commit h-20 a corrigé le filtre côté requête mais pas la RLS.)
--
--   2. clients : `rls-granular.sql` définit clients_admin_all /
--      _trainer_read / _client_read_own — RIEN pour 'commercial'.
--      Conséquence : menu client vide à la création de tâche, devis
--      liés à un client_id non résolus.
--
-- STRATÉGIE — additif uniquement : on AJOUTE des policies dédiées
-- 'commercial' sans toucher aux policies existantes (PostgreSQL combine
-- les policies en OR). Filtre entity_id systématique pour l'isolation
-- multi-tenant.
--
-- Helpers : public.user_role() / public.user_entity_id() (schema public,
-- cf. HOTFIX_auth_helpers.sql — `auth.*` est verrouillé sur Supabase
-- hébergé).
--
-- Idempotent : DROP POLICY IF EXISTS (du nom dédié) + CREATE POLICY.
--
-- À exécuter manuellement dans Supabase Dashboard SQL Editor AVANT
-- déploiement Netlify.
-- ============================================================

-- ===== profiles : lecture des profils de l'entité par les commerciaux =====
-- SELECT uniquement : un commercial doit voir ses collègues (admin,
-- super_admin, trainer, autres commerciaux) pour les dropdowns
-- d'assignation. Pas de droit UPDATE/DELETE (réservé admin).
DROP POLICY IF EXISTS "profiles_commercial_read" ON profiles;
CREATE POLICY "profiles_commercial_read" ON profiles
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'commercial'
    AND entity_id = public.user_entity_id()
  );

-- ===== clients : accès CRM complet des commerciaux dans leur entité =====
-- FOR ALL : un commercial gère les clients dans le cadre du CRM
-- (devis, conversion prospect -> client). Scope entity_id = isolation.
DROP POLICY IF EXISTS "clients_commercial_all" ON clients;
CREATE POLICY "clients_commercial_all" ON clients
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'commercial'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'commercial'
    AND entity_id = public.user_entity_id()
  );

-- ============================================================
-- Vérification après exécution :
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename IN ('profiles', 'clients')
--     AND policyname LIKE '%commercial%';
-- → doit lister profiles_commercial_read (SELECT)
--   et clients_commercial_all (ALL)
--
-- Test fonctionnel (compte de rôle 'commercial') :
--   - /admin/crm/tasks  : le menu « Assigné à » liste toute l'équipe
--   - /admin/crm/prospects : le menu « Assigné à » liste toute l'équipe
--   - création de tâche : le menu « Client » est peuplé
-- ============================================================
