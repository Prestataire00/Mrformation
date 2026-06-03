-- ============================================================
-- Migration : Lot B audit BMAD — Fix RLS programs / program_versions
-- ============================================================
--
-- Constat audit BMAD :
--  - Policies actuelles utilisent `auth.user_role()` au lieu de
--    `public.user_role()`. Les helpers dans le schéma `auth` sont
--    VERROUILLÉS côté Supabase hébergé (mémoire feedback_rls_helpers_
--    public_not_auth.md, épisode aut-a-1 PR #172).
--  - Policies n'incluent PAS le rôle `super_admin` → Loris bloqué en
--    prod quand il manipule les programmes.
--
-- Fix :
--  - Recréer les policies en `public.user_role()` (fonction existante,
--    cf HOTFIX_auth_helpers.sql).
--  - Inclure explicitement `super_admin` via policy dédiée (cross-entité).
--  - Conserver l'isolation multi-tenant `entity_id` pour les `admin` /
--    `trainer` / `client`.
--
-- Idempotent : DROP POLICY IF EXISTS + CREATE POLICY.
-- À exécuter manuellement dans Supabase Dashboard SQL Editor.
-- ============================================================

-- ===== programs =====
DROP POLICY IF EXISTS "programs_admin_all" ON programs;
CREATE POLICY "programs_admin_all" ON programs
  FOR ALL TO authenticated
  USING (public.user_role() = 'admin' AND entity_id = public.user_entity_id())
  WITH CHECK (public.user_role() = 'admin' AND entity_id = public.user_entity_id());

DROP POLICY IF EXISTS "programs_super_admin_all" ON programs;
CREATE POLICY "programs_super_admin_all" ON programs
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');

DROP POLICY IF EXISTS "programs_trainer_read" ON programs;
CREATE POLICY "programs_trainer_read" ON programs
  FOR SELECT TO authenticated
  USING (public.user_role() = 'trainer' AND entity_id = public.user_entity_id());

DROP POLICY IF EXISTS "programs_client_read" ON programs;
CREATE POLICY "programs_client_read" ON programs
  FOR SELECT TO authenticated
  USING (public.user_role() = 'client' AND entity_id = public.user_entity_id());

-- ===== program_versions =====
DROP POLICY IF EXISTS "program_versions_admin_all" ON program_versions;
CREATE POLICY "program_versions_admin_all" ON program_versions
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND program_id IN (SELECT id FROM programs WHERE entity_id = public.user_entity_id())
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND program_id IN (SELECT id FROM programs WHERE entity_id = public.user_entity_id())
  );

DROP POLICY IF EXISTS "program_versions_super_admin_all" ON program_versions;
CREATE POLICY "program_versions_super_admin_all" ON program_versions
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');

DROP POLICY IF EXISTS "program_versions_trainer_read" ON program_versions;
CREATE POLICY "program_versions_trainer_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND program_id IN (SELECT id FROM programs WHERE entity_id = public.user_entity_id())
  );

DROP POLICY IF EXISTS "program_versions_client_read" ON program_versions;
CREATE POLICY "program_versions_client_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND program_id IN (SELECT id FROM programs WHERE entity_id = public.user_entity_id())
  );
