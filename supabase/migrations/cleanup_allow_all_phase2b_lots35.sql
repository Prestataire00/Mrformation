-- ============================================================
-- Migration : Cleanup allow_all Phase 2B - Lots B3 + B5
-- ============================================================
-- 9 tables : questionnaires, questions, questionnaire_responses,
--            crm_client_tags, crm_prospect_tags, crm_quote_lines,
--            crm_automation_rules, locations, referrals
--
-- ⚠️ TEST APRÈS APPLICATION :
--   - Page /admin/questionnaires : liste + création + voir réponses
--   - Page formation [id] : tab Évaluation, tab Satisfaction (utilisent questions+responses)
--   - Page CRM Prospects : ajout/retrait de tags
--   - Page CRM Quotes : édition d'un devis (lignes)
--   - Page CRM Automations : liste des règles
--   - Page /admin/lieux : CRUD locations
--   - Création de session avec sélection de location
--
-- ROLLBACK : recréer la policy permissive sur la table fautive.
-- ============================================================

-- 1. questionnaires (entity_id direct)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_admin_all" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_other_roles_read" ON questionnaires;

CREATE POLICY "questionnaires_admin_all" ON questionnaires
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

CREATE POLICY "questionnaires_other_roles_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = user_entity_id()
  );

-- 2. questions (via questionnaire_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON questions;
DROP POLICY IF EXISTS "questions_admin_all" ON questions;
DROP POLICY IF EXISTS "questions_other_roles_read" ON questions;

CREATE POLICY "questions_admin_all" ON questions
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  );

CREATE POLICY "questions_other_roles_read" ON questions
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  );

-- 3. questionnaire_responses (via questionnaire_id + learner ownership)
-- ============================================================
-- ⚠️ /api/questionnaire/public-submit utilise service_role → bypass RLS
DROP POLICY IF EXISTS "allow_all" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_admin_all" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_trainer_read" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_learner_read" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_learner_insert" ON questionnaire_responses;

CREATE POLICY "questionnaire_responses_admin_all" ON questionnaire_responses
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  );

CREATE POLICY "questionnaire_responses_trainer_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

CREATE POLICY "questionnaire_responses_learner_own" ON questionnaire_responses
  FOR ALL TO authenticated
  USING (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- 4. crm_client_tags (jonction via client_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_client_tags;
DROP POLICY IF EXISTS "crm_client_tags_admin_all" ON crm_client_tags;

CREATE POLICY "crm_client_tags_admin_all" ON crm_client_tags
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  );

-- 5. crm_prospect_tags (jonction via prospect_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_prospect_tags;
DROP POLICY IF EXISTS "crm_prospect_tags_admin_all" ON crm_prospect_tags;

CREATE POLICY "crm_prospect_tags_admin_all" ON crm_prospect_tags
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
  );

-- 6. crm_quote_lines (via quote_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_quote_lines;
DROP POLICY IF EXISTS "crm_quote_lines_all" ON crm_quote_lines;
DROP POLICY IF EXISTS "crm_quote_lines_admin_all" ON crm_quote_lines;

CREATE POLICY "crm_quote_lines_admin_all" ON crm_quote_lines
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND quote_id IN (SELECT id FROM crm_quotes WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND quote_id IN (SELECT id FROM crm_quotes WHERE entity_id = user_entity_id())
  );

-- 7. crm_automation_rules (entity_id direct)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_automation_rules;
DROP POLICY IF EXISTS "crm_automation_rules_admin" ON crm_automation_rules;
DROP POLICY IF EXISTS "crm_automation_rules_admin_all" ON crm_automation_rules;

CREATE POLICY "crm_automation_rules_admin_all" ON crm_automation_rules
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

-- 8. locations (entity_id direct, lecture pour tous les rôles car utilisé en planning)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON locations;
DROP POLICY IF EXISTS "Users can view locations of their entity" ON locations;
DROP POLICY IF EXISTS "locations_admin_all" ON locations;
DROP POLICY IF EXISTS "locations_other_roles_read" ON locations;

CREATE POLICY "locations_admin_all" ON locations
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

CREATE POLICY "locations_other_roles_read" ON locations
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = user_entity_id()
  );

-- 9. referrals (programme de parrainage cross-entité)
-- ============================================================
-- Pas de colonne entity_id : c'est un programme global. On restreint la
-- lecture aux admins/super_admins. L'insert reste ouvert (user qui parraine).
DROP POLICY IF EXISTS "allow_all" ON referrals;
DROP POLICY IF EXISTS "referrals_admin_read" ON referrals;
DROP POLICY IF EXISTS "referrals_insert" ON referrals;
DROP POLICY IF EXISTS "referrals_admin_update" ON referrals;

CREATE POLICY "referrals_admin_all" ON referrals
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin'))
  WITH CHECK (user_role() IN ('admin', 'super_admin'));

CREATE POLICY "referrals_self_insert" ON referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_user_id = auth.uid());

-- ============================================================
-- Vérification (à exécuter après) :
--
-- 1. Plus aucune policy permissive sur ces 9 tables :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename IN ('questionnaires','questions','questionnaire_responses',
--                       'crm_client_tags','crm_prospect_tags','crm_quote_lines',
--                       'crm_automation_rules','locations','referrals');
-- (devrait retourner 0 lignes)
--
-- 2. Compte total restant (devrait passer de ~23 à ~14) :
--   SELECT COUNT(DISTINCT tablename) FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename NOT IN ('entities','learner_access_tokens','signing_tokens',
--                           'pappers_cache','training_domains');
-- ============================================================
