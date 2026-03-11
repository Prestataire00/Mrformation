-- ============================================================
-- NUCLEAR FIX — Supprimer TOUTES les policies RLS cassées
-- et les remplacer par 1 policy permissive par table.
-- Coller dans Supabase SQL Editor > Run
-- ============================================================

-- ============================================================
-- PARTIE 1: Fonctions helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PARTIE 2: Supprimer TOUTES les policies existantes
-- ============================================================

-- ENTITIES
DROP POLICY IF EXISTS "entities_read_authenticated" ON entities;
DROP POLICY IF EXISTS "entities_fallback_authenticated" ON entities;
DROP POLICY IF EXISTS "Authenticated users can read entities" ON entities;

-- PROFILES
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
DROP POLICY IF EXISTS "profiles_fallback_authenticated" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- CLIENTS
DROP POLICY IF EXISTS "clients_admin_all" ON clients;
DROP POLICY IF EXISTS "clients_trainer_read" ON clients;
DROP POLICY IF EXISTS "clients_client_read_own" ON clients;
DROP POLICY IF EXISTS "clients_fallback_authenticated" ON clients;
DROP POLICY IF EXISTS "Auth users full access clients" ON clients;

-- CONTACTS
DROP POLICY IF EXISTS "contacts_admin_all" ON contacts;
DROP POLICY IF EXISTS "contacts_trainer_read" ON contacts;
DROP POLICY IF EXISTS "contacts_client_read_own" ON contacts;
DROP POLICY IF EXISTS "contacts_fallback_authenticated" ON contacts;
DROP POLICY IF EXISTS "Auth users full access contacts" ON contacts;

-- LEARNERS
DROP POLICY IF EXISTS "learners_admin_all" ON learners;
DROP POLICY IF EXISTS "learners_trainer_read" ON learners;
DROP POLICY IF EXISTS "learners_client_read" ON learners;
DROP POLICY IF EXISTS "learners_self_read" ON learners;
DROP POLICY IF EXISTS "learners_self_update" ON learners;
DROP POLICY IF EXISTS "learners_fallback_authenticated" ON learners;
DROP POLICY IF EXISTS "Auth users full access learners" ON learners;

-- TRAINERS
DROP POLICY IF EXISTS "trainers_admin_all" ON trainers;
DROP POLICY IF EXISTS "trainers_trainer_read" ON trainers;
DROP POLICY IF EXISTS "trainers_client_read" ON trainers;
DROP POLICY IF EXISTS "trainers_learner_read" ON trainers;
DROP POLICY IF EXISTS "trainers_authenticated_access" ON trainers;
DROP POLICY IF EXISTS "trainers_fallback_authenticated" ON trainers;
DROP POLICY IF EXISTS "Auth users full access trainers" ON trainers;

-- TRAINER_COMPETENCIES
DROP POLICY IF EXISTS "trainer_competencies_admin_all" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_trainer_read" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_client_read" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_learner_read" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_authenticated_access" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_fallback_authenticated" ON trainer_competencies;
DROP POLICY IF EXISTS "Auth users full access trainer_competencies" ON trainer_competencies;

-- TRAININGS
DROP POLICY IF EXISTS "trainings_admin_all" ON trainings;
DROP POLICY IF EXISTS "trainings_trainer_read" ON trainings;
DROP POLICY IF EXISTS "trainings_client_read" ON trainings;
DROP POLICY IF EXISTS "trainings_learner_read" ON trainings;
DROP POLICY IF EXISTS "trainings_fallback_authenticated" ON trainings;
DROP POLICY IF EXISTS "Auth users full access trainings" ON trainings;

-- SESSIONS
DROP POLICY IF EXISTS "sessions_admin_all" ON sessions;
DROP POLICY IF EXISTS "sessions_trainer_read" ON sessions;
DROP POLICY IF EXISTS "sessions_client_read" ON sessions;
DROP POLICY IF EXISTS "sessions_learner_read" ON sessions;
DROP POLICY IF EXISTS "sessions_fallback_authenticated" ON sessions;
DROP POLICY IF EXISTS "Auth users full access sessions" ON sessions;

-- ENROLLMENTS
DROP POLICY IF EXISTS "enrollments_admin_all" ON enrollments;
DROP POLICY IF EXISTS "enrollments_trainer_read" ON enrollments;
DROP POLICY IF EXISTS "enrollments_client_read" ON enrollments;
DROP POLICY IF EXISTS "enrollments_learner_read" ON enrollments;
DROP POLICY IF EXISTS "enrollments_fallback_authenticated" ON enrollments;
DROP POLICY IF EXISTS "Auth users full access enrollments" ON enrollments;

-- PROGRAMS
DROP POLICY IF EXISTS "programs_admin_all" ON programs;
DROP POLICY IF EXISTS "programs_trainer_read" ON programs;
DROP POLICY IF EXISTS "programs_client_read" ON programs;
DROP POLICY IF EXISTS "programs_fallback_authenticated" ON programs;
DROP POLICY IF EXISTS "Auth users full access programs" ON programs;

-- PROGRAM_VERSIONS
DROP POLICY IF EXISTS "program_versions_admin_all" ON program_versions;
DROP POLICY IF EXISTS "program_versions_trainer_read" ON program_versions;
DROP POLICY IF EXISTS "program_versions_client_read" ON program_versions;
DROP POLICY IF EXISTS "program_versions_fallback_authenticated" ON program_versions;
DROP POLICY IF EXISTS "Auth users full access program_versions" ON program_versions;

-- QUESTIONNAIRES
DROP POLICY IF EXISTS "questionnaires_admin_all" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_trainer_read" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_client_read" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_learner_read" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_fallback_authenticated" ON questionnaires;
DROP POLICY IF EXISTS "Auth users full access questionnaires" ON questionnaires;

-- QUESTIONS
DROP POLICY IF EXISTS "questions_admin_all" ON questions;
DROP POLICY IF EXISTS "questions_trainer_read" ON questions;
DROP POLICY IF EXISTS "questions_client_read" ON questions;
DROP POLICY IF EXISTS "questions_learner_read" ON questions;
DROP POLICY IF EXISTS "questions_fallback_authenticated" ON questions;
DROP POLICY IF EXISTS "Auth users full access questions" ON questions;

-- QUESTIONNAIRE_RESPONSES
DROP POLICY IF EXISTS "questionnaire_responses_admin_all" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_trainer_read" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_learner_insert" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_learner_read" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_fallback_authenticated" ON questionnaire_responses;
DROP POLICY IF EXISTS "Auth users full access responses" ON questionnaire_responses;

-- DOCUMENT_TEMPLATES
DROP POLICY IF EXISTS "document_templates_admin_all" ON document_templates;
DROP POLICY IF EXISTS "document_templates_trainer_read" ON document_templates;
DROP POLICY IF EXISTS "document_templates_client_read" ON document_templates;
DROP POLICY IF EXISTS "document_templates_fallback_authenticated" ON document_templates;
DROP POLICY IF EXISTS "Auth users full access doc_templates" ON document_templates;

-- GENERATED_DOCUMENTS
DROP POLICY IF EXISTS "generated_documents_admin_all" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_trainer_read" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_client_read" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_learner_read" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_fallback_authenticated" ON generated_documents;
DROP POLICY IF EXISTS "Auth users full access gen_docs" ON generated_documents;

-- EMAIL_TEMPLATES
DROP POLICY IF EXISTS "email_templates_admin_all" ON email_templates;
DROP POLICY IF EXISTS "email_templates_trainer_read" ON email_templates;
DROP POLICY IF EXISTS "email_templates_fallback_authenticated" ON email_templates;
DROP POLICY IF EXISTS "Auth users full access email_templates" ON email_templates;

-- EMAIL_HISTORY
DROP POLICY IF EXISTS "email_history_admin_all" ON email_history;
DROP POLICY IF EXISTS "email_history_trainer_read" ON email_history;
DROP POLICY IF EXISTS "email_history_fallback_authenticated" ON email_history;
DROP POLICY IF EXISTS "Auth users full access email_history" ON email_history;

-- SIGNATURES
DROP POLICY IF EXISTS "signatures_admin_all" ON signatures;
DROP POLICY IF EXISTS "signatures_trainer_insert" ON signatures;
DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
DROP POLICY IF EXISTS "signatures_learner_insert" ON signatures;
DROP POLICY IF EXISTS "signatures_learner_read" ON signatures;
DROP POLICY IF EXISTS "signatures_fallback_authenticated" ON signatures;
DROP POLICY IF EXISTS "Auth users full access signatures" ON signatures;

-- CRM_PROSPECTS
DROP POLICY IF EXISTS "crm_prospects_admin_all" ON crm_prospects;
DROP POLICY IF EXISTS "crm_prospects_fallback_authenticated" ON crm_prospects;
DROP POLICY IF EXISTS "CRM sales reps read own prospects" ON crm_prospects;
DROP POLICY IF EXISTS "CRM sales reps update own prospects" ON crm_prospects;
DROP POLICY IF EXISTS "Auth users full access crm_prospects" ON crm_prospects;

-- CRM_TASKS
DROP POLICY IF EXISTS "crm_tasks_admin_all" ON crm_tasks;
DROP POLICY IF EXISTS "crm_tasks_fallback_authenticated" ON crm_tasks;
DROP POLICY IF EXISTS "CRM sales reps read own tasks" ON crm_tasks;
DROP POLICY IF EXISTS "CRM sales reps update own tasks" ON crm_tasks;
DROP POLICY IF EXISTS "CRM sales reps insert tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Auth users full access crm_tasks" ON crm_tasks;

-- CRM_QUOTES
DROP POLICY IF EXISTS "crm_quotes_admin_all" ON crm_quotes;
DROP POLICY IF EXISTS "crm_quotes_fallback_authenticated" ON crm_quotes;
DROP POLICY IF EXISTS "CRM sales reps read own quotes" ON crm_quotes;
DROP POLICY IF EXISTS "CRM sales reps update own quotes" ON crm_quotes;
DROP POLICY IF EXISTS "Auth users full access crm_quotes" ON crm_quotes;

-- CRM_CAMPAIGNS
DROP POLICY IF EXISTS "crm_campaigns_admin_all" ON crm_campaigns;
DROP POLICY IF EXISTS "crm_campaigns_fallback_authenticated" ON crm_campaigns;
DROP POLICY IF EXISTS "Auth users full access crm_campaigns" ON crm_campaigns;

-- ACTIVITY_LOG
DROP POLICY IF EXISTS "activity_log_admin_all" ON activity_log;
DROP POLICY IF EXISTS "activity_log_trainer_insert" ON activity_log;
DROP POLICY IF EXISTS "activity_log_trainer_read" ON activity_log;
DROP POLICY IF EXISTS "activity_log_learner_insert" ON activity_log;
DROP POLICY IF EXISTS "activity_log_fallback_authenticated" ON activity_log;
DROP POLICY IF EXISTS "Auth users full access activity_log" ON activity_log;

-- CLIENT_DOCUMENTS
DROP POLICY IF EXISTS "client_documents_admin_all" ON client_documents;

-- REFERRALS
DROP POLICY IF EXISTS "referrals_admin_read" ON referrals;
DROP POLICY IF EXISTS "referrals_insert" ON referrals;
DROP POLICY IF EXISTS "referrals_admin_update" ON referrals;
DROP POLICY IF EXISTS "referrals_anon_insert" ON referrals;

-- BPF_FINANCIAL_DATA
DROP POLICY IF EXISTS "bpf_financial_data_admin_all" ON bpf_financial_data;

-- CRM_TAGS
DROP POLICY IF EXISTS "Auth users full access crm_tags" ON crm_tags;

-- CRM_PROSPECT_TAGS
DROP POLICY IF EXISTS "Auth users full access crm_prospect_tags" ON crm_prospect_tags;

-- CRM_CLIENT_TAGS
DROP POLICY IF EXISTS "Auth users full access crm_client_tags" ON crm_client_tags;

-- CRM_NOTIFICATIONS
DROP POLICY IF EXISTS "Users see own notifications" ON crm_notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON crm_notifications;
DROP POLICY IF EXISTS "Auth users insert notifications" ON crm_notifications;
DROP POLICY IF EXISTS "Users delete own notifications" ON crm_notifications;

-- CRM_QUOTE_LINES
DROP POLICY IF EXISTS "crm_quote_lines_all" ON crm_quote_lines;

-- ELEARNING
DROP POLICY IF EXISTS "Auth users full access elearning_courses" ON elearning_courses;
DROP POLICY IF EXISTS "Auth users full access elearning_chapters" ON elearning_chapters;
DROP POLICY IF EXISTS "Auth users full access elearning_quizzes" ON elearning_quizzes;
DROP POLICY IF EXISTS "Auth users full access elearning_quiz_questions" ON elearning_quiz_questions;
DROP POLICY IF EXISTS "Auth users full access elearning_flashcards" ON elearning_flashcards;
DROP POLICY IF EXISTS "Auth users full access elearning_enrollments" ON elearning_enrollments;
DROP POLICY IF EXISTS "Auth users full access elearning_chapter_progress" ON elearning_chapter_progress;
DROP POLICY IF EXISTS "Auth users full access elearning_final_exam_questions" ON elearning_final_exam_questions;
DROP POLICY IF EXISTS "Auth users full access elearning_global_flashcards" ON elearning_global_flashcards;
DROP POLICY IF EXISTS "Auth users full access elearning_final_exam_progress" ON elearning_final_exam_progress;
DROP POLICY IF EXISTS "Auth users full access elearning_slide_specs" ON elearning_slide_specs;
DROP POLICY IF EXISTS "Auth users full access elearning_live_sessions" ON elearning_live_sessions;

-- ELEARNING_COURSE_SCORES
DROP POLICY IF EXISTS "Authenticated users can manage their own scores" ON elearning_course_scores;
DROP POLICY IF EXISTS "Admins can view all scores" ON elearning_course_scores;

-- LOCATIONS
DROP POLICY IF EXISTS "Users can view locations of their entity" ON locations;
DROP POLICY IF EXISTS "Admins can manage locations" ON locations;


-- ============================================================
-- PARTIE 3: Recréer 1 policy permissive par table
-- ============================================================

CREATE POLICY "allow_all" ON entities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON learners FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON trainers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON trainer_competencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON trainings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON programs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON program_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON questionnaires FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON questionnaire_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON document_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON generated_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON email_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_prospects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON client_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON referrals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon" ON referrals FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "allow_all" ON bpf_financial_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_prospect_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_client_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crm_quote_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_courses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_chapters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_quizzes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_quiz_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_flashcards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_chapter_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_final_exam_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_global_flashcards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_final_exam_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_slide_specs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_live_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON elearning_course_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON locations FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- PARTIE 4: Schema migration (colonnes manquantes)
-- ============================================================

-- Nouvelle table: training_domains
CREATE TABLE IF NOT EXISTS training_domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE training_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON training_domains FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ALTER clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'France';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS opco TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS funding_type TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ALTER trainings
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS duration_days DECIMAL(5, 2);
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS min_participants INTEGER;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS program TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS certification_name TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS training_domain_id UUID REFERENCES training_domains(id) ON DELETE SET NULL;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ALTER trainers
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'France';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ALTER trainer_competencies
ALTER TABLE trainer_competencies ADD COLUMN IF NOT EXISTS training_domain_id UUID REFERENCES training_domains(id) ON DELETE CASCADE;

-- ALTER sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE sessions ALTER COLUMN end_date DROP NOT NULL;
ALTER TABLE sessions ALTER COLUMN title DROP NOT NULL;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled', 'planned'));


-- ============================================================
-- Vérification
-- ============================================================
SELECT 'NUCLEAR FIX OK — Toutes les policies nettoyées, schema mis à jour.' AS result;
