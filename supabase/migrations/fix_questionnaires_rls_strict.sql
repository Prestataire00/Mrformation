-- ============================================================================
-- Migration : RLS strictes par rôle sur les tables d'attribution de
-- questionnaires (3 tables). Résout P0-2 du deep-dive 2026-05-25.
--
-- AVANT : policies FOR ALL ou granulaires sans check de rôle — un learner
--         authentifié dans la même entité pouvait INSERT/UPDATE/DELETE.
--         (Task 0 Investigation A a révélé que formation_evaluation_assignments
--          a déjà 4 policies granulaires fea_entity_* sans rôle check, et que
--          les 2 autres tables ont encore des FOR ALL.)
-- APRÈS : 4 policies par table (SELECT autorisé entity match,
--         INSERT/UPDATE/DELETE restreints à admin/super_admin).
--
-- Source : docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md §4
-- ============================================================================

-- ============================================================================
-- 1. formation_evaluation_assignments
-- ============================================================================
-- DROP des 4 policies granulaires existantes (créées par fix_evaluation_assignments_rls.sql)
DROP POLICY IF EXISTS "fea_entity_read" ON formation_evaluation_assignments;
DROP POLICY IF EXISTS "fea_entity_insert" ON formation_evaluation_assignments;
DROP POLICY IF EXISTS "fea_entity_update" ON formation_evaluation_assignments;
DROP POLICY IF EXISTS "fea_entity_delete" ON formation_evaluation_assignments;
-- Compat noms candidats anciens (no-op si absents)
DROP POLICY IF EXISTS "fea_entity_access" ON formation_evaluation_assignments;
DROP POLICY IF EXISTS "Admins manage formation_evaluation_assignments" ON formation_evaluation_assignments;

-- SELECT : tout utilisateur authentifié de la même entité (admin/trainer/learner)
CREATE POLICY "fea_select_entity" ON formation_evaluation_assignments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
    )
  );

-- INSERT : admin/super_admin uniquement (entity scoped)
CREATE POLICY "fea_insert_admin" ON formation_evaluation_assignments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- UPDATE : admin/super_admin uniquement
CREATE POLICY "fea_update_admin" ON formation_evaluation_assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- DELETE : admin/super_admin uniquement
CREATE POLICY "fea_delete_admin" ON formation_evaluation_assignments
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ============================================================================
-- 2. formation_satisfaction_assignments (pattern identique)
-- ============================================================================
DROP POLICY IF EXISTS "fsa_entity_access" ON formation_satisfaction_assignments;
DROP POLICY IF EXISTS "Admins manage formation_satisfaction_assignments" ON formation_satisfaction_assignments;

CREATE POLICY "fsa_select_entity" ON formation_satisfaction_assignments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
    )
  );

CREATE POLICY "fsa_insert_admin" ON formation_satisfaction_assignments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "fsa_update_admin" ON formation_satisfaction_assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "fsa_delete_admin" ON formation_satisfaction_assignments
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ============================================================================
-- 3. questionnaire_tokens
-- ============================================================================
DROP POLICY IF EXISTS "admins_manage_questionnaire_tokens" ON questionnaire_tokens;
DROP POLICY IF EXISTS "Admins manage questionnaire_tokens" ON questionnaire_tokens;
DROP POLICY IF EXISTS "questionnaire_tokens_all" ON questionnaire_tokens;

CREATE POLICY "qt_select_entity" ON questionnaire_tokens
  FOR SELECT TO authenticated USING (
    entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "qt_insert_admin" ON questionnaire_tokens
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "qt_update_admin" ON questionnaire_tokens
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "qt_delete_admin" ON questionnaire_tokens
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Note : les opérations de submit public (public-submit/route.ts) passent
-- en service_role (bypass RLS) — ces policies ne les affectent pas.
