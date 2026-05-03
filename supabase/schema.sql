-- ============================================================
-- LMS MR FORMATION - Schéma de base de données Supabase
-- Version 1.0 - Février 2026
-- ============================================================

-- Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: entities (MR FORMATION, C3V FORMATION)
-- ============================================================
CREATE TABLE IF NOT EXISTS entities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  theme_color TEXT DEFAULT '#3a3d44',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertion des deux entités
INSERT INTO entities (name, slug, theme_color) VALUES
  ('MR FORMATION', 'mr-formation', '#2563EB'),
  ('C3V FORMATION', 'c3v-formation', '#7C3AED')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- TABLE: profiles (étend auth.users de Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('super_admin', 'admin', 'commercial', 'trainer', 'client', 'learner')),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  has_crm_access BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger pour créer un profil à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'admin')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TABLE: clients (entreprises clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  siret TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  website TEXT,
  sector TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: contacts (contacts au sein des entreprises)
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: learners (apprenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS learners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: trainers (formateurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS trainers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  type TEXT DEFAULT 'internal' CHECK (type IN ('internal', 'external')),
  bio TEXT,
  hourly_rate DECIMAL(10, 2),
  availability_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: trainer_competencies (compétences formateurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS trainer_competencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE NOT NULL,
  competency TEXT NOT NULL,
  level TEXT DEFAULT 'intermediate' CHECK (level IN ('beginner', 'intermediate', 'expert'))
);

-- ============================================================
-- TABLE: trainings (catalogue de formations)
-- ============================================================
CREATE TABLE IF NOT EXISTS trainings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT,
  duration_hours DECIMAL(5, 2),
  max_participants INTEGER,
  price_per_person DECIMAL(10, 2),
  category TEXT,
  certification TEXT,
  prerequisites TEXT,
  classification TEXT CHECK (classification IN ('reglementaire', 'certifiant', 'qualifiant')),
  program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: training_categories (catégories de formations dynamiques)
-- ============================================================
CREATE TABLE IF NOT EXISTS training_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'bg-gray-100 text-gray-700',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE training_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_categories_admin_all" ON training_categories
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- ============================================================
-- TABLE: sessions (sessions de formation)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  training_id UUID REFERENCES trainings(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  mode TEXT DEFAULT 'presentiel' CHECK (mode IN ('presentiel', 'distanciel', 'hybride')),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled')),
  max_participants INTEGER,
  trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: enrollments (inscriptions aux sessions)
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'confirmed', 'cancelled', 'completed')),
  completion_rate INTEGER DEFAULT 0,
  enrolled_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: programs (programmes pédagogiques)
-- ============================================================
CREATE TABLE IF NOT EXISTS programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  content JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: program_versions (versions des programmes)
-- ============================================================
CREATE TABLE IF NOT EXISTS program_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  content JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: questionnaires
-- ============================================================
CREATE TABLE IF NOT EXISTS questionnaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'satisfaction' CHECK (type IN ('satisfaction', 'evaluation', 'survey')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: questions (questions des questionnaires)
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  type TEXT DEFAULT 'rating' CHECK (type IN ('rating', 'text', 'multiple_choice', 'yes_no')),
  options JSONB,
  order_index INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TABLE: questionnaire_sessions (liaison questionnaire ↔ session)
-- ============================================================
CREATE TABLE IF NOT EXISTS questionnaire_sessions (
  questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  auto_send_on_completion BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (questionnaire_id, session_id)
);

-- ============================================================
-- TABLE: questionnaire_responses (réponses)
-- ============================================================
CREATE TABLE IF NOT EXISTS questionnaire_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  responses JSONB DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: document_templates (modèles de documents)
-- ============================================================
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('agreement', 'certificate', 'attendance', 'invoice', 'other')),
  content TEXT,
  variables JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: generated_documents (documents générés)
-- ============================================================
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: email_templates (modèles d'emails)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT,
  variables JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: email_history (historique des envois)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
  sent_via TEXT DEFAULT 'resend' CHECK (sent_via IN ('resend', 'gmail'))
);

-- ============================================================
-- TABLE: gmail_connections (connexions Gmail OAuth2 des formateurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS gmail_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE NOT NULL UNIQUE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  gmail_address TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_auth_tag TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  last_error TEXT
);

ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: signatures (signatures électroniques)
-- ============================================================
CREATE TABLE IF NOT EXISTS signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  signer_id UUID,
  signer_type TEXT CHECK (signer_type IN ('learner', 'trainer')),
  signature_data TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  document_id UUID REFERENCES generated_documents(id) ON DELETE SET NULL
);

-- ============================================================
-- TABLE: crm_prospects (prospects CRM)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  siret TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  source TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  converted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: crm_tasks (tâches CRM)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: crm_quotes (devis)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  reference TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: crm_campaigns (campagnes email)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  target_type TEXT CHECK (target_type IN ('all_clients', 'all_prospects', 'segment')),
  sent_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: activity_log (journal d'activité)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Activer RLS sur toutes les tables
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GRANULAR ROLE-BASED RLS POLICIES
-- ============================================================

-- Helper functions in auth schema
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop any legacy permissive policies (idempotent cleanup)
DROP POLICY IF EXISTS "Authenticated users can read entities" ON entities;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Auth users full access clients" ON clients;
DROP POLICY IF EXISTS "Auth users full access contacts" ON contacts;
DROP POLICY IF EXISTS "Auth users full access learners" ON learners;
DROP POLICY IF EXISTS "Auth users full access trainers" ON trainers;
DROP POLICY IF EXISTS "Auth users full access trainer_competencies" ON trainer_competencies;
DROP POLICY IF EXISTS "Auth users full access trainings" ON trainings;
DROP POLICY IF EXISTS "Auth users full access sessions" ON sessions;
DROP POLICY IF EXISTS "Auth users full access enrollments" ON enrollments;
DROP POLICY IF EXISTS "Auth users full access programs" ON programs;
DROP POLICY IF EXISTS "Auth users full access program_versions" ON program_versions;
DROP POLICY IF EXISTS "Auth users full access questionnaires" ON questionnaires;
DROP POLICY IF EXISTS "Auth users full access questions" ON questions;
DROP POLICY IF EXISTS "Auth users full access responses" ON questionnaire_responses;
DROP POLICY IF EXISTS "Auth users full access doc_templates" ON document_templates;
DROP POLICY IF EXISTS "Auth users full access gen_docs" ON generated_documents;
DROP POLICY IF EXISTS "Auth users full access email_templates" ON email_templates;
DROP POLICY IF EXISTS "Auth users full access email_history" ON email_history;
DROP POLICY IF EXISTS "Auth users full access signatures" ON signatures;
DROP POLICY IF EXISTS "Auth users full access crm_prospects" ON crm_prospects;
DROP POLICY IF EXISTS "Auth users full access crm_tasks" ON crm_tasks;
DROP POLICY IF EXISTS "Auth users full access crm_quotes" ON crm_quotes;
DROP POLICY IF EXISTS "Auth users full access crm_campaigns" ON crm_campaigns;
DROP POLICY IF EXISTS "Auth users full access activity_log" ON activity_log;

-- ===== ENTITIES =====
CREATE POLICY "entities_read_authenticated" ON entities
  FOR SELECT TO authenticated USING (true);

-- ===== PROFILES =====
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ===== CLIENTS =====
CREATE POLICY "clients_admin_all" ON clients
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "clients_trainer_read" ON clients
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "clients_client_read_own" ON clients
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
    AND id IN (
      SELECT client_id FROM learners WHERE profile_id = auth.uid()
      UNION
      SELECT id FROM clients WHERE id IN (
        SELECT client_id FROM learners WHERE profile_id = auth.uid()
      )
    )
  );

-- ===== CONTACTS =====
CREATE POLICY "contacts_admin_all" ON contacts
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND client_id IN (SELECT id FROM clients WHERE entity_id = auth.user_entity_id()))
  WITH CHECK (auth.user_role() = 'admin' AND client_id IN (SELECT id FROM clients WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "contacts_trainer_read" ON contacts
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND client_id IN (SELECT id FROM clients WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "contacts_client_read_own" ON contacts
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid()));

-- ===== LEARNERS =====
CREATE POLICY "learners_admin_all" ON learners
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

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

CREATE POLICY "learners_client_read" ON learners
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND entity_id = auth.user_entity_id()
    AND client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid())
  );

CREATE POLICY "learners_self_read" ON learners
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'learner' AND profile_id = auth.uid());

CREATE POLICY "learners_self_update" ON learners
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'learner' AND profile_id = auth.uid())
  WITH CHECK (auth.user_role() = 'learner' AND profile_id = auth.uid());

-- ===== TRAINERS =====
CREATE POLICY "trainers_admin_all" ON trainers
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainers_trainer_read" ON trainers
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainers_client_read" ON trainers
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainers_learner_read" ON trainers
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'learner' AND entity_id = auth.user_entity_id());

-- ===== TRAINER_COMPETENCIES =====
CREATE POLICY "trainer_competencies_admin_all" ON trainer_competencies
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()))
  WITH CHECK (auth.user_role() = 'admin' AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "trainer_competencies_trainer_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "trainer_competencies_client_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "trainer_competencies_learner_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'learner' AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = auth.user_entity_id()));

-- ===== TRAININGS =====
CREATE POLICY "trainings_admin_all" ON trainings
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainings_trainer_read" ON trainings
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainings_client_read" ON trainings
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainings_learner_read" ON trainings
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'learner' AND entity_id = auth.user_entity_id());

-- ===== SESSIONS =====
CREATE POLICY "sessions_admin_all" ON sessions
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "sessions_trainer_read" ON sessions
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "sessions_client_read" ON sessions
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND entity_id = auth.user_entity_id());

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

-- ===== ENROLLMENTS =====
CREATE POLICY "enrollments_admin_all" ON enrollments
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND session_id IN (SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()))
  WITH CHECK (auth.user_role() = 'admin' AND session_id IN (SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "enrollments_trainer_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid() AND s.entity_id = auth.user_entity_id()
    )
  );

CREATE POLICY "enrollments_client_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND (
      client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid())
      OR learner_id IN (
        SELECT id FROM learners WHERE client_id IN (
          SELECT client_id FROM learners WHERE profile_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "enrollments_learner_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- ===== PROGRAMS =====
CREATE POLICY "programs_admin_all" ON programs
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "programs_trainer_read" ON programs
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "programs_client_read" ON programs
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND entity_id = auth.user_entity_id());

-- ===== PROGRAM_VERSIONS =====
CREATE POLICY "program_versions_admin_all" ON program_versions
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND program_id IN (SELECT id FROM programs WHERE entity_id = auth.user_entity_id()))
  WITH CHECK (auth.user_role() = 'admin' AND program_id IN (SELECT id FROM programs WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "program_versions_trainer_read" ON program_versions
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND program_id IN (SELECT id FROM programs WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "program_versions_client_read" ON program_versions
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND program_id IN (SELECT id FROM programs WHERE entity_id = auth.user_entity_id()));

-- ===== QUESTIONNAIRES =====
CREATE POLICY "questionnaires_admin_all" ON questionnaires
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "questionnaires_trainer_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "questionnaires_client_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND entity_id = auth.user_entity_id());

CREATE POLICY "questionnaires_learner_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'learner' AND entity_id = auth.user_entity_id() AND is_active = true);

-- ===== QUESTIONS =====
CREATE POLICY "questions_admin_all" ON questions
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()))
  WITH CHECK (auth.user_role() = 'admin' AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "questions_trainer_read" ON questions
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "questions_client_read" ON questions
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "questions_learner_read" ON questions
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id() AND is_active = true
    )
  );

-- ===== QUESTIONNAIRE_RESPONSES =====
CREATE POLICY "questionnaire_responses_admin_all" ON questionnaire_responses
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()))
  WITH CHECK (auth.user_role() = 'admin' AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = auth.user_entity_id()));

CREATE POLICY "questionnaire_responses_trainer_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid() AND s.entity_id = auth.user_entity_id()
    )
  );

CREATE POLICY "questionnaire_responses_learner_insert" ON questionnaire_responses
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'learner' AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid()));

CREATE POLICY "questionnaire_responses_learner_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'learner' AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid()));

-- ===== DOCUMENT_TEMPLATES =====
CREATE POLICY "document_templates_admin_all" ON document_templates
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "document_templates_trainer_read" ON document_templates
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "document_templates_client_read" ON document_templates
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'client' AND entity_id = auth.user_entity_id());

-- ===== GENERATED_DOCUMENTS =====
CREATE POLICY "generated_documents_admin_all" ON generated_documents
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND (
      template_id IN (SELECT id FROM document_templates WHERE entity_id = auth.user_entity_id())
      OR session_id IN (SELECT id FROM sessions WHERE entity_id = auth.user_entity_id())
      OR client_id IN (SELECT id FROM clients WHERE entity_id = auth.user_entity_id())
    )
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND (
      template_id IN (SELECT id FROM document_templates WHERE entity_id = auth.user_entity_id())
      OR session_id IN (SELECT id FROM sessions WHERE entity_id = auth.user_entity_id())
      OR client_id IN (SELECT id FROM clients WHERE entity_id = auth.user_entity_id())
    )
  );

CREATE POLICY "generated_documents_trainer_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid() AND s.entity_id = auth.user_entity_id()
    )
  );

CREATE POLICY "generated_documents_client_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'client'
    AND client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid())
  );

CREATE POLICY "generated_documents_learner_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- ===== EMAIL_TEMPLATES =====
CREATE POLICY "email_templates_admin_all" ON email_templates
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "email_templates_trainer_read" ON email_templates
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

-- ===== EMAIL_HISTORY =====
CREATE POLICY "email_history_admin_all" ON email_history
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "email_history_trainer_read" ON email_history
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

-- ===== GMAIL_CONNECTIONS =====
CREATE POLICY "gmail_connections_trainer_own" ON gmail_connections
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "gmail_connections_admin_read" ON gmail_connections
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = auth.user_entity_id())
  );

-- ===== SIGNATURES =====
CREATE POLICY "signatures_admin_all" ON signatures
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'admin'
    AND (session_id IN (SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()) OR session_id IS NULL)
  )
  WITH CHECK (
    auth.user_role() = 'admin'
    AND (session_id IN (SELECT id FROM sessions WHERE entity_id = auth.user_entity_id()) OR session_id IS NULL)
  );

CREATE POLICY "signatures_trainer_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'trainer' AND signer_type = 'trainer' AND signer_id = auth.uid());

CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND (
      (signer_type = 'trainer' AND signer_id = auth.uid())
      OR session_id IN (
        SELECT s.id FROM sessions s
        JOIN trainers t ON t.id = s.trainer_id
        WHERE t.profile_id = auth.uid() AND s.entity_id = auth.user_entity_id()
      )
    )
  );

CREATE POLICY "signatures_learner_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'learner' AND signer_type = 'learner' AND signer_id = auth.uid());

CREATE POLICY "signatures_learner_read" ON signatures
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'learner' AND signer_type = 'learner' AND signer_id = auth.uid());

-- ===== CRM_PROSPECTS =====
CREATE POLICY "crm_prospects_admin_all" ON crm_prospects
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

-- ===== CRM_TASKS =====
CREATE POLICY "crm_tasks_admin_all" ON crm_tasks
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

-- ===== CRM_QUOTES =====
CREATE POLICY "crm_quotes_admin_all" ON crm_quotes
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

-- ===== CRM_CAMPAIGNS =====
CREATE POLICY "crm_campaigns_admin_all" ON crm_campaigns
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

-- ===== ACTIVITY_LOG =====
CREATE POLICY "activity_log_admin_all" ON activity_log
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "activity_log_trainer_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id() AND user_id = auth.uid());

CREATE POLICY "activity_log_trainer_read" ON activity_log
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'trainer' AND entity_id = auth.user_entity_id());

CREATE POLICY "activity_log_learner_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'learner' AND entity_id = auth.user_entity_id() AND user_id = auth.uid());

-- ============================================================
-- TABLE: client_documents (documents contractuels client)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'other' CHECK (type IN ('contract', 'agreement', 'invoice', 'quote', 'bpf', 'certificate', 'other')),
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_documents_admin_all" ON client_documents
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  );

CREATE POLICY "client_documents_trainer_read" ON client_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  );

CREATE POLICY "client_documents_client_read_own" ON client_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'client'
    AND client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid())
  );

-- ============================================================
-- TABLE: client_comments (commentaires internes sur les clients)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE client_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_comments_admin_all" ON client_comments
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
    AND author_id = auth.uid()
  );


-- ============================================================
-- TABLE: bpf_financial_data (données financières BPF manuelles)
-- ============================================================
CREATE TABLE IF NOT EXISTS bpf_financial_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  fiscal_year INTEGER NOT NULL,
  section_c JSONB DEFAULT '{}',
  section_d JSONB DEFAULT '{}',
  section_g JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, fiscal_year)
);

ALTER TABLE bpf_financial_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bpf_financial_data_admin_all" ON bpf_financial_data
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  );

-- ============================================================
-- ALTER: learners - ajout learner_type pour BPF section F-1
-- ============================================================
ALTER TABLE learners ADD COLUMN IF NOT EXISTS learner_type TEXT
  DEFAULT 'salarie'
  CHECK (learner_type IN ('salarie', 'apprenti', 'demandeur_emploi', 'particulier', 'autre'));

-- ============================================================
-- ALTER: trainings - ajout codes NSF pour BPF section F-4
-- ============================================================
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS nsf_code TEXT;
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS nsf_label TEXT;

-- ============================================================
-- ALTER: questionnaires - ajout quality_indicator_type pour suivi qualité
-- ============================================================
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS quality_indicator_type TEXT
  CHECK (quality_indicator_type IN (
    'eval_preformation', 'eval_pendant', 'eval_postformation',
    'auto_eval_pre', 'auto_eval_post',
    'satisfaction_chaud', 'satisfaction_froid',
    'quest_financeurs', 'quest_formateurs', 'quest_managers',
    'quest_entreprises', 'autres_quest'
  ));

-- ============================================================
-- TABLE: quality_scores (scores qualité pré-calculés par session)
-- ============================================================
CREATE TABLE IF NOT EXISTS quality_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  formation TEXT NOT NULL,
  year INTEGER NOT NULL,
  month TEXT, -- YYYY-MM for chart grouping
  eval_preformation NUMERIC(5,4),
  eval_pendant NUMERIC(5,4),
  eval_postformation NUMERIC(5,4),
  auto_eval_pre NUMERIC(5,4),
  auto_eval_post NUMERIC(5,4),
  satisfaction_chaud NUMERIC(5,4),
  satisfaction_froid NUMERIC(5,4),
  quest_financeurs NUMERIC(5,4),
  quest_formateurs NUMERIC(5,4),
  quest_managers NUMERIC(5,4),
  quest_entreprises NUMERIC(5,4),
  autres_quest NUMERIC(5,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: signing_tokens (tokens d'émargement publics)
-- ============================================================
CREATE TABLE IF NOT EXISTS signing_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  token_type TEXT DEFAULT 'individual' CHECK (token_type IN ('session', 'individual')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signing_tokens_token ON signing_tokens(token);
CREATE INDEX IF NOT EXISTS idx_signing_tokens_session ON signing_tokens(session_id);

-- Contrainte unique pour éviter les doublons de signatures
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_session_signer'
  ) THEN
    ALTER TABLE signatures ADD CONSTRAINT unique_session_signer
      UNIQUE (session_id, signer_id, signer_type);
  END IF;
END $$;

-- ============================================================
-- TABLE: trainer_courses (supports de cours formateurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS trainer_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE NOT NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  files JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_courses_trainer ON trainer_courses(trainer_id);

ALTER TABLE trainer_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_courses_admin_all" ON trainer_courses
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainer_courses_trainer_own" ON trainer_courses
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    auth.user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- ============================================================
-- TABLE: trainer_documents (documents formateurs — session & admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS trainer_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE NOT NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('session', 'admin')),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_path TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT session_required CHECK (scope != 'session' OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_trainer_docs_trainer ON trainer_documents(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_docs_scope ON trainer_documents(trainer_id, scope);

ALTER TABLE trainer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_documents_admin_all" ON trainer_documents
  FOR ALL TO authenticated
  USING (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id())
  WITH CHECK (auth.user_role() = 'admin' AND entity_id = auth.user_entity_id());

CREATE POLICY "trainer_documents_trainer_own" ON trainer_documents
  FOR ALL TO authenticated
  USING (
    auth.user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    auth.user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- ============================================================
-- DONNÉES DE DÉMONSTRATION
-- ============================================================

-- Note: Ces données nécessitent que des users auth existent d'abord.
-- Elles sont à insérer manuellement ou via les scripts de seed.
