-- ============================================================
-- Migration : Cleanup allow_all Phase 2B - Lots B2 + B4
-- ============================================================
-- Crée les policies granulaires manquantes sur 6 tables, puis
-- DROP les `allow_all` qui les annulaient.
--
-- Lot B2 (Documents/signatures) : generated_documents, signatures, prospect_comments
-- Lot B4 (Trainings/Programs)   : program_versions, trainings, trainer_competencies
--
-- Pattern : admin/super_admin filtré par entity_id (directe ou via JOIN),
-- + autres rôles (trainer/client/learner) avec accès en lecture quand légitime.
--
-- ⚠️ TEST APRÈS APPLICATION :
--   - Catalogue formations (page /admin/trainings)
--   - Création/édition de session avec génération de documents
--   - Page formation [id] : tabs ConventionDocs, Émargements, DocsPartages
--   - Page CRM Prospects : commentaires
--   - Page Trainers : compétences
--
-- ROLLBACK : recréer la policy permissive sur la table fautive :
--   CREATE POLICY "allow_all" ON <table> FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
-- ============================================================

-- 1. trainings (entity_id direct — le plus simple)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON trainings;
DROP POLICY IF EXISTS "trainings_admin_all" ON trainings;
DROP POLICY IF EXISTS "trainings_trainer_read" ON trainings;
DROP POLICY IF EXISTS "trainings_client_read" ON trainings;
DROP POLICY IF EXISTS "trainings_learner_read" ON trainings;

CREATE POLICY "trainings_admin_all" ON trainings
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

CREATE POLICY "trainings_other_roles_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = user_entity_id()
  );

-- 2. program_versions (entity_id via programs)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON program_versions;
DROP POLICY IF EXISTS "program_versions_admin_all" ON program_versions;
DROP POLICY IF EXISTS "program_versions_trainer_read" ON program_versions;

CREATE POLICY "program_versions_admin_all" ON program_versions
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND program_id IN (SELECT id FROM programs WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND program_id IN (SELECT id FROM programs WHERE entity_id = user_entity_id())
  );

CREATE POLICY "program_versions_trainer_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND program_id IN (SELECT id FROM programs WHERE entity_id = user_entity_id())
  );

-- 3. trainer_competencies (entity_id via trainers)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_admin_all" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_self" ON trainer_competencies;

CREATE POLICY "trainer_competencies_admin_all" ON trainer_competencies
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = user_entity_id())
  );

CREATE POLICY "trainer_competencies_self" ON trainer_competencies
  FOR ALL TO authenticated
  USING (
    user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- 4. prospect_comments (entity_id via crm_prospects, admin only)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON prospect_comments;
DROP POLICY IF EXISTS "prospect_comments_admin_all" ON prospect_comments;

CREATE POLICY "prospect_comments_admin_all" ON prospect_comments
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
    AND author_id = auth.uid()
  );

-- 5. signatures (entity_id via sessions)
-- ============================================================
-- ⚠️ Les routes publiques (/api/emargement/sign) utilisent service_role
-- → bypass RLS, pas affectées. Les composants admin lisent via session.
DROP POLICY IF EXISTS "allow_all" ON signatures;
DROP POLICY IF EXISTS "signatures_admin_all" ON signatures;
DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
DROP POLICY IF EXISTS "signatures_learner_read" ON signatures;

CREATE POLICY "signatures_admin_all" ON signatures
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
  );

CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

CREATE POLICY "signatures_learner_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    user_role() = 'learner'
    AND signer_type = 'learner'
    AND signer_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- 6. generated_documents (entity_id via session_id ou client_id ou learner_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_admin_all" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_trainer_read" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_client_read" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_learner_read" ON generated_documents;

CREATE POLICY "generated_documents_admin_all" ON generated_documents
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND (
      session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
      OR client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
      OR learner_id IN (SELECT id FROM learners WHERE entity_id = user_entity_id())
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND (
      session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
      OR client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
      OR learner_id IN (SELECT id FROM learners WHERE entity_id = user_entity_id())
    )
  );

CREATE POLICY "generated_documents_trainer_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

CREATE POLICY "generated_documents_client_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'client'
    AND client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid())
  );

CREATE POLICY "generated_documents_learner_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- ============================================================
-- Vérification (à exécuter après) :
--
-- 1. Confirme qu'aucune policy permissive ne reste sur ces 6 tables :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename IN ('trainings','program_versions','trainer_competencies',
--                       'prospect_comments','signatures','generated_documents');
-- (devrait retourner 0 lignes)
--
-- 2. Compte total restant (devrait passer de ~29 à ~23) :
--   SELECT COUNT(DISTINCT tablename) FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename NOT IN ('entities','learner_access_tokens','signing_tokens',
--                           'pappers_cache','training_domains');
-- ============================================================
