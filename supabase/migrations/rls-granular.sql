-- ============================================================
-- LMS MR FORMATION - Granular Role-Based RLS Policies
-- Migration: rls-granular.sql
-- Date: 2026-03-01
--
-- Roles: admin | trainer | client | learner
--
-- NOTE: service_role key bypasses RLS automatically in Supabase.
-- These policies apply to anon and authenticated roles only.
-- ============================================================


-- ============================================================
-- STEP 1: Helper functions in auth schema
-- ============================================================

-- Returns the role of the currently authenticated user
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns the entity_id of the currently authenticated user
CREATE OR REPLACE FUNCTION auth.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- STEP 2: ENTITIES table
-- All authenticated users can read their own entity.
-- Only admins can manage entities (in practice handled via service_role).
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can read entities" ON entities;

CREATE POLICY "entities_read_authenticated" ON entities
  FOR SELECT TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policies for entities: managed via service_role only.


-- ============================================================
-- STEP 3: PROFILES table
-- ============================================================

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Admin: full CRUD on all profiles within their entity
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Non-admin: read own profile only
CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Non-admin: update own profile only
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ============================================================
-- STEP 4: CLIENTS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access clients" ON clients;

-- Admin: full CRUD within their entity
CREATE POLICY "clients_admin_all" ON clients
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "clients_trainer_read" ON clients
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: read only their own client record
-- The client profile links to a clients row via a matching email or a direct join.
-- We use the profiles.id match to the learner/client context.
-- Client users see the client record where the profile belongs to that client.
CREATE POLICY "clients_client_read_own" ON clients
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
    AND id IN (
      SELECT client_id FROM learners
      WHERE profile_id = auth.uid()
      UNION
      SELECT id FROM clients
      WHERE id IN (
        SELECT client_id FROM learners WHERE profile_id = auth.uid()
      )
    )
  );

-- Learner: no access (no policy created)


-- ============================================================
-- STEP 5: CONTACTS table
-- Contacts belong to clients, so access mirrors clients access.
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access contacts" ON contacts;

-- Admin: full CRUD for contacts whose client is in their entity
CREATE POLICY "contacts_admin_all" ON contacts
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND client_id IN (
      SELECT id FROM clients WHERE entity_id = auth.user_entity_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND client_id IN (
      SELECT id FROM clients WHERE entity_id = auth.user_entity_id()
    )
  );

-- Trainer: read-only for contacts in their entity
CREATE POLICY "contacts_trainer_read" ON contacts
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND client_id IN (
      SELECT id FROM clients WHERE entity_id = auth.user_entity_id()
    )
  );

-- Client: read contacts belonging to their own client record
CREATE POLICY "contacts_client_read_own" ON contacts
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND client_id IN (
      SELECT client_id FROM learners WHERE profile_id = auth.uid()
    )
  );

-- Learner: no access


-- ============================================================
-- STEP 6: LEARNERS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access learners" ON learners;

-- Admin: full CRUD within their entity
CREATE POLICY "learners_admin_all" ON learners
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only for learners enrolled in sessions they train
CREATE POLICY "learners_trainer_read" ON learners
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
    AND id IN (
      SELECT e.learner_id FROM enrollments e
      JOIN sessions s ON s.id = e.session_id
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

-- Client: read learners linked to their client record
CREATE POLICY "learners_client_read" ON learners
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
    AND client_id IN (
      SELECT client_id FROM learners WHERE profile_id = auth.uid()
      UNION
      SELECT id FROM clients
      WHERE id IN (
        SELECT client_id FROM learners WHERE profile_id = auth.uid()
      )
    )
  );

-- Learner: read and update their own learner record
CREATE POLICY "learners_self_read" ON learners
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND profile_id = auth.uid()
  );

CREATE POLICY "learners_self_update" ON learners
  FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND profile_id = auth.uid()
  )
  WITH CHECK (
    auth.user_role() = 'learner'
    AND profile_id = auth.uid()
  );


-- ============================================================
-- STEP 7: TRAINERS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access trainers" ON trainers;

-- Admin: full CRUD within their entity
CREATE POLICY "trainers_admin_all" ON trainers
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "trainers_trainer_read" ON trainers
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: read-only within their entity (to see who trained their learners)
CREATE POLICY "trainers_client_read" ON trainers
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
  );

-- Learner: read-only (to see their trainer's info)
CREATE POLICY "trainers_learner_read" ON trainers
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND entity_id = auth.user_entity_id()
  );


-- ============================================================
-- STEP 8: TRAINER_COMPETENCIES table
-- Access follows the trainer's access pattern.
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access trainer_competencies" ON trainer_competencies;

-- Admin: full CRUD for competencies of trainers in their entity
CREATE POLICY "trainer_competencies_admin_all" ON trainer_competencies
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()
    )
  );

-- Trainer: read their own competencies and others in their entity
CREATE POLICY "trainer_competencies_trainer_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()
    )
  );

-- Client: read competencies for trainers in their entity
CREATE POLICY "trainer_competencies_client_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()
    )
  );

-- Learner: read competencies for trainers in their entity
CREATE POLICY "trainer_competencies_learner_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()
    )
  );


-- ============================================================
-- STEP 9: TRAININGS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access trainings" ON trainings;

-- Admin: full CRUD within their entity
CREATE POLICY "trainings_admin_all" ON trainings
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "trainings_trainer_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: read-only within their entity
CREATE POLICY "trainings_client_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
  );

-- Learner: read-only within their entity (to see available trainings)
CREATE POLICY "trainings_learner_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND entity_id = auth.user_entity_id()
  );


-- ============================================================
-- STEP 10: SESSIONS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access sessions" ON sessions;

-- Admin: full CRUD within their entity
CREATE POLICY "sessions_admin_all" ON sessions
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "sessions_trainer_read" ON sessions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: read-only within their entity
CREATE POLICY "sessions_client_read" ON sessions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
  );

-- Learner: read sessions they are enrolled in
CREATE POLICY "sessions_learner_read" ON sessions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND entity_id = auth.user_entity_id()
    AND id IN (
      SELECT e.session_id FROM enrollments e
      JOIN learners l ON l.id = e.learner_id
      WHERE l.profile_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 11: ENROLLMENTS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access enrollments" ON enrollments;

-- Admin: full CRUD for enrollments in sessions within their entity
CREATE POLICY "enrollments_admin_all" ON enrollments
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND session_id IN (
      SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND session_id IN (
      SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()
    )
  );

-- Trainer: read enrollments for sessions they are leading
CREATE POLICY "enrollments_trainer_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
        AND s.entity_id = auth.user_entity_id()
    )
  );

-- Client: read enrollments for their client's learners
CREATE POLICY "enrollments_client_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND (
      client_id IN (
        SELECT client_id FROM learners WHERE profile_id = auth.uid()
      )
      OR learner_id IN (
        SELECT id FROM learners WHERE client_id IN (
          SELECT client_id FROM learners WHERE profile_id = auth.uid()
        )
      )
    )
  );

-- Learner: read their own enrollments
CREATE POLICY "enrollments_learner_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND learner_id IN (
      SELECT id FROM learners WHERE profile_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 12: PROGRAMS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access programs" ON programs;

-- Admin: full CRUD within their entity
CREATE POLICY "programs_admin_all" ON programs
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "programs_trainer_read" ON programs
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: read-only within their entity
CREATE POLICY "programs_client_read" ON programs
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
  );

-- Learner: no access to programs directly


-- ============================================================
-- STEP 13: PROGRAM_VERSIONS table
-- Access follows the programs access pattern.
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access program_versions" ON program_versions;

-- Admin: full CRUD for program versions within their entity
CREATE POLICY "program_versions_admin_all" ON program_versions
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = auth.user_entity_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = auth.user_entity_id()
    )
  );

-- Trainer: read-only for program versions in their entity
CREATE POLICY "program_versions_trainer_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = auth.user_entity_id()
    )
  );

-- Client: read-only for program versions in their entity
CREATE POLICY "program_versions_client_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = auth.user_entity_id()
    )
  );

-- Learner: no access


-- ============================================================
-- STEP 14: QUESTIONNAIRES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access questionnaires" ON questionnaires;

-- Admin: full CRUD within their entity
CREATE POLICY "questionnaires_admin_all" ON questionnaires
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "questionnaires_trainer_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: read-only within their entity
CREATE POLICY "questionnaires_client_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
  );

-- Learner: read active questionnaires within their entity (to fill them in)
CREATE POLICY "questionnaires_learner_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND entity_id = auth.user_entity_id()
    AND is_active = true
  );


-- ============================================================
-- STEP 15: QUESTIONS table
-- Questions belong to questionnaires; access mirrors questionnaires.
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access questions" ON questions;

-- Admin: full CRUD for questions of questionnaires in their entity
CREATE POLICY "questions_admin_all" ON questions
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()
    )
  );

-- Trainer: read-only
CREATE POLICY "questions_trainer_read" ON questions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()
    )
  );

-- Client: read-only
CREATE POLICY "questions_client_read" ON questions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()
    )
  );

-- Learner: read questions for active questionnaires in their entity
CREATE POLICY "questions_learner_read" ON questions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE entity_id = auth.user_entity_id()
        AND is_active = true
    )
  );


-- ============================================================
-- STEP 16: QUESTIONNAIRE_RESPONSES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access responses" ON questionnaire_responses;

-- Admin: full CRUD for responses for questionnaires in their entity
CREATE POLICY "questionnaire_responses_admin_all" ON questionnaire_responses
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()
    )
  );

-- Trainer: read responses for sessions they lead
CREATE POLICY "questionnaire_responses_trainer_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
        AND s.entity_id = auth.user_entity_id()
    )
  );

-- Learner: insert their own responses and read their own
CREATE POLICY "questionnaire_responses_learner_insert" ON questionnaire_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'learner'
    AND learner_id IN (
      SELECT id FROM learners WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "questionnaire_responses_learner_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND learner_id IN (
      SELECT id FROM learners WHERE profile_id = auth.uid()
    )
  );

-- Client: no access to individual responses


-- ============================================================
-- STEP 17: DOCUMENT_TEMPLATES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access doc_templates" ON document_templates;

-- Admin: full CRUD within their entity
CREATE POLICY "document_templates_admin_all" ON document_templates
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "document_templates_trainer_read" ON document_templates
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: read-only within their entity
CREATE POLICY "document_templates_client_read" ON document_templates
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
  );

-- Learner: no access


-- ============================================================
-- STEP 18: GENERATED_DOCUMENTS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access gen_docs" ON generated_documents;

-- Admin: full CRUD for documents linked to their entity
-- (via template, session, or client)
CREATE POLICY "generated_documents_admin_all" ON generated_documents
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND (
      template_id IN (
        SELECT id FROM document_templates WHERE entity_id = auth.user_entity_id()
      )
      OR session_id IN (
        SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()
      )
      OR client_id IN (
        SELECT id FROM clients WHERE entity_id = auth.user_entity_id()
      )
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND (
      template_id IN (
        SELECT id FROM document_templates WHERE entity_id = auth.user_entity_id()
      )
      OR session_id IN (
        SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()
      )
      OR client_id IN (
        SELECT id FROM clients WHERE entity_id = auth.user_entity_id()
      )
    )
  );

-- Trainer: read documents for sessions they lead
CREATE POLICY "generated_documents_trainer_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
        AND s.entity_id = auth.user_entity_id()
    )
  );

-- Client: read documents for their client record
CREATE POLICY "generated_documents_client_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND client_id IN (
      SELECT client_id FROM learners WHERE profile_id = auth.uid()
    )
  );

-- Learner: read documents linked to them
CREATE POLICY "generated_documents_learner_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND learner_id IN (
      SELECT id FROM learners WHERE profile_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 19: EMAIL_TEMPLATES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access email_templates" ON email_templates;

-- Admin: full CRUD within their entity
CREATE POLICY "email_templates_admin_all" ON email_templates
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "email_templates_trainer_read" ON email_templates
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: no access
-- Learner: no access


-- ============================================================
-- STEP 20: EMAIL_HISTORY table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access email_history" ON email_history;

-- Admin: full CRUD within their entity
CREATE POLICY "email_history_admin_all" ON email_history
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: read-only within their entity
CREATE POLICY "email_history_trainer_read" ON email_history
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Client: no access
-- Learner: no access


-- ============================================================
-- STEP 21: SIGNATURES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access signatures" ON signatures;

-- Admin: full access for signatures linked to sessions in their entity
CREATE POLICY "signatures_admin_all" ON signatures
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND (
      session_id IN (
        SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()
      )
      OR session_id IS NULL
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND (
      session_id IN (
        SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()
      )
      OR session_id IS NULL
    )
  );

-- Trainer: insert their own signatures and read all signatures for their sessions
CREATE POLICY "signatures_trainer_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'trainer'
    AND signer_type = 'trainer'
    AND signer_id = auth.uid()
  );

CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND (
      -- Own signatures
      (signer_type = 'trainer' AND signer_id = auth.uid())
      OR
      -- All signatures for sessions they lead
      session_id IN (
        SELECT s.id FROM sessions s
        JOIN trainers t ON t.id = s.trainer_id
        WHERE t.profile_id = auth.uid()
          AND s.entity_id = auth.user_entity_id()
      )
    )
  );

-- Learner: insert their own signature and read their own signatures
CREATE POLICY "signatures_learner_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'learner'
    AND signer_type = 'learner'
    AND signer_id = auth.uid()
  );

CREATE POLICY "signatures_learner_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND signer_type = 'learner'
    AND signer_id = auth.uid()
  );

-- Client: no access


-- ============================================================
-- STEP 22: CRM_PROSPECTS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_prospects" ON crm_prospects;

-- Admin: full CRUD within their entity
CREATE POLICY "crm_prospects_admin_all" ON crm_prospects
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 23: CRM_TASKS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_tasks" ON crm_tasks;

-- Admin: full CRUD within their entity
CREATE POLICY "crm_tasks_admin_all" ON crm_tasks
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 24: CRM_QUOTES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_quotes" ON crm_quotes;

-- Admin: full CRUD within their entity
CREATE POLICY "crm_quotes_admin_all" ON crm_quotes
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 25: CRM_CAMPAIGNS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_campaigns" ON crm_campaigns;

-- Admin: full CRUD within their entity
CREATE POLICY "crm_campaigns_admin_all" ON crm_campaigns
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 26: ACTIVITY_LOG table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access activity_log" ON activity_log;

-- Admin: full access within their entity
CREATE POLICY "activity_log_admin_all" ON activity_log
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND entity_id = auth.user_entity_id()
  );

-- Trainer: insert their own activity logs and read logs for their entity
CREATE POLICY "activity_log_trainer_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "activity_log_trainer_read" ON activity_log
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND entity_id = auth.user_entity_id()
  );

-- Learner: insert their own activity logs only
CREATE POLICY "activity_log_learner_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'learner'
    AND entity_id = auth.user_entity_id()
    AND user_id = auth.uid()
  );

-- Client: no access to activity log
