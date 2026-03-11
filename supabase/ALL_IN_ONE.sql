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
  role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('admin', 'trainer', 'client', 'learner')),
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
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
  error_message TEXT
);

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
  created_at TIMESTAMPTZ DEFAULT NOW()
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
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns the entity_id of the currently authenticated user
CREATE OR REPLACE FUNCTION public.user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- STEP 2: ENTITIES table
-- All authenticated users can read their own entity.
-- Only admins can manage entities (in practice handled via service_role).
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can read entities" ON entities;

DROP POLICY IF EXISTS "entities_read_authenticated" ON entities;
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
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Non-admin: read own profile only
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Non-admin: update own profile only
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ============================================================
-- STEP 4: CLIENTS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access clients" ON clients;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "clients_admin_all" ON clients;
CREATE POLICY "clients_admin_all" ON clients
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "clients_trainer_read" ON clients;
CREATE POLICY "clients_trainer_read" ON clients
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: read only their own client record
-- The client profile links to a clients row via a matching email or a direct join.
-- We use the profiles.id match to the learner/client context.
-- Client users see the client record where the profile belongs to that client.
DROP POLICY IF EXISTS "clients_client_read_own" ON clients;
CREATE POLICY "clients_client_read_own" ON clients
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
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
DROP POLICY IF EXISTS "contacts_admin_all" ON contacts;
CREATE POLICY "contacts_admin_all" ON contacts
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND client_id IN (
      SELECT id FROM clients WHERE entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND client_id IN (
      SELECT id FROM clients WHERE entity_id = public.user_entity_id()
    )
  );

-- Trainer: read-only for contacts in their entity
DROP POLICY IF EXISTS "contacts_trainer_read" ON contacts;
CREATE POLICY "contacts_trainer_read" ON contacts
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND client_id IN (
      SELECT id FROM clients WHERE entity_id = public.user_entity_id()
    )
  );

-- Client: read contacts belonging to their own client record
DROP POLICY IF EXISTS "contacts_client_read_own" ON contacts;
CREATE POLICY "contacts_client_read_own" ON contacts
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
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
DROP POLICY IF EXISTS "learners_admin_all" ON learners;
CREATE POLICY "learners_admin_all" ON learners
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only for learners enrolled in sessions they train
DROP POLICY IF EXISTS "learners_trainer_read" ON learners;
CREATE POLICY "learners_trainer_read" ON learners
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
    AND id IN (
      SELECT e.learner_id FROM enrollments e
      JOIN sessions s ON s.id = e.session_id
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

-- Client: read learners linked to their client record
DROP POLICY IF EXISTS "learners_client_read" ON learners;
CREATE POLICY "learners_client_read" ON learners
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
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
DROP POLICY IF EXISTS "learners_self_read" ON learners;
CREATE POLICY "learners_self_read" ON learners
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "learners_self_update" ON learners;
CREATE POLICY "learners_self_update" ON learners
  FOR UPDATE TO authenticated
  USING (
    public.user_role() = 'learner'
    AND profile_id = auth.uid()
  )
  WITH CHECK (
    public.user_role() = 'learner'
    AND profile_id = auth.uid()
  );


-- ============================================================
-- STEP 7: TRAINERS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access trainers" ON trainers;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "trainers_admin_all" ON trainers;
CREATE POLICY "trainers_admin_all" ON trainers
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "trainers_trainer_read" ON trainers;
CREATE POLICY "trainers_trainer_read" ON trainers
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: read-only within their entity (to see who trained their learners)
DROP POLICY IF EXISTS "trainers_client_read" ON trainers;
CREATE POLICY "trainers_client_read" ON trainers
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
  );

-- Learner: read-only (to see their trainer's info)
DROP POLICY IF EXISTS "trainers_learner_read" ON trainers;
CREATE POLICY "trainers_learner_read" ON trainers
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND entity_id = public.user_entity_id()
  );


-- ============================================================
-- STEP 8: TRAINER_COMPETENCIES table
-- Access follows the trainer's access pattern.
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access trainer_competencies" ON trainer_competencies;

-- Admin: full CRUD for competencies of trainers in their entity
DROP POLICY IF EXISTS "trainer_competencies_admin_all" ON trainer_competencies;
CREATE POLICY "trainer_competencies_admin_all" ON trainer_competencies
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = public.user_entity_id()
    )
  );

-- Trainer: read their own competencies and others in their entity
DROP POLICY IF EXISTS "trainer_competencies_trainer_read" ON trainer_competencies;
CREATE POLICY "trainer_competencies_trainer_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = public.user_entity_id()
    )
  );

-- Client: read competencies for trainers in their entity
DROP POLICY IF EXISTS "trainer_competencies_client_read" ON trainer_competencies;
CREATE POLICY "trainer_competencies_client_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = public.user_entity_id()
    )
  );

-- Learner: read competencies for trainers in their entity
DROP POLICY IF EXISTS "trainer_competencies_learner_read" ON trainer_competencies;
CREATE POLICY "trainer_competencies_learner_read" ON trainer_competencies
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND trainer_id IN (
      SELECT id FROM trainers WHERE entity_id = public.user_entity_id()
    )
  );


-- ============================================================
-- STEP 9: TRAININGS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access trainings" ON trainings;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "trainings_admin_all" ON trainings;
CREATE POLICY "trainings_admin_all" ON trainings
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "trainings_trainer_read" ON trainings;
CREATE POLICY "trainings_trainer_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: read-only within their entity
DROP POLICY IF EXISTS "trainings_client_read" ON trainings;
CREATE POLICY "trainings_client_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
  );

-- Learner: read-only within their entity (to see available trainings)
DROP POLICY IF EXISTS "trainings_learner_read" ON trainings;
CREATE POLICY "trainings_learner_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND entity_id = public.user_entity_id()
  );


-- ============================================================
-- STEP 10: SESSIONS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access sessions" ON sessions;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "sessions_admin_all" ON sessions;
CREATE POLICY "sessions_admin_all" ON sessions
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "sessions_trainer_read" ON sessions;
CREATE POLICY "sessions_trainer_read" ON sessions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: read-only within their entity
DROP POLICY IF EXISTS "sessions_client_read" ON sessions;
CREATE POLICY "sessions_client_read" ON sessions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
  );

-- Learner: read sessions they are enrolled in
DROP POLICY IF EXISTS "sessions_learner_read" ON sessions;
CREATE POLICY "sessions_learner_read" ON sessions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND entity_id = public.user_entity_id()
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
DROP POLICY IF EXISTS "enrollments_admin_all" ON enrollments;
CREATE POLICY "enrollments_admin_all" ON enrollments
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND session_id IN (
      SELECT id FROM sessions WHERE entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND session_id IN (
      SELECT id FROM sessions WHERE entity_id = public.user_entity_id()
    )
  );

-- Trainer: read enrollments for sessions they are leading
DROP POLICY IF EXISTS "enrollments_trainer_read" ON enrollments;
CREATE POLICY "enrollments_trainer_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
        AND s.entity_id = public.user_entity_id()
    )
  );

-- Client: read enrollments for their client's learners
DROP POLICY IF EXISTS "enrollments_client_read" ON enrollments;
CREATE POLICY "enrollments_client_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
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
DROP POLICY IF EXISTS "enrollments_learner_read" ON enrollments;
CREATE POLICY "enrollments_learner_read" ON enrollments
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND learner_id IN (
      SELECT id FROM learners WHERE profile_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 12: PROGRAMS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access programs" ON programs;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "programs_admin_all" ON programs;
CREATE POLICY "programs_admin_all" ON programs
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "programs_trainer_read" ON programs;
CREATE POLICY "programs_trainer_read" ON programs
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: read-only within their entity
DROP POLICY IF EXISTS "programs_client_read" ON programs;
CREATE POLICY "programs_client_read" ON programs
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
  );

-- Learner: no access to programs directly


-- ============================================================
-- STEP 13: PROGRAM_VERSIONS table
-- Access follows the programs access pattern.
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access program_versions" ON program_versions;

-- Admin: full CRUD for program versions within their entity
DROP POLICY IF EXISTS "program_versions_admin_all" ON program_versions;
CREATE POLICY "program_versions_admin_all" ON program_versions
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = public.user_entity_id()
    )
  );

-- Trainer: read-only for program versions in their entity
DROP POLICY IF EXISTS "program_versions_trainer_read" ON program_versions;
CREATE POLICY "program_versions_trainer_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = public.user_entity_id()
    )
  );

-- Client: read-only for program versions in their entity
DROP POLICY IF EXISTS "program_versions_client_read" ON program_versions;
CREATE POLICY "program_versions_client_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND program_id IN (
      SELECT id FROM programs WHERE entity_id = public.user_entity_id()
    )
  );

-- Learner: no access


-- ============================================================
-- STEP 14: QUESTIONNAIRES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access questionnaires" ON questionnaires;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "questionnaires_admin_all" ON questionnaires;
CREATE POLICY "questionnaires_admin_all" ON questionnaires
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "questionnaires_trainer_read" ON questionnaires;
CREATE POLICY "questionnaires_trainer_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: read-only within their entity
DROP POLICY IF EXISTS "questionnaires_client_read" ON questionnaires;
CREATE POLICY "questionnaires_client_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
  );

-- Learner: read active questionnaires within their entity (to fill them in)
DROP POLICY IF EXISTS "questionnaires_learner_read" ON questionnaires;
CREATE POLICY "questionnaires_learner_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND entity_id = public.user_entity_id()
    AND is_active = true
  );


-- ============================================================
-- STEP 15: QUESTIONS table
-- Questions belong to questionnaires; access mirrors questionnaires.
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access questions" ON questions;

-- Admin: full CRUD for questions of questionnaires in their entity
DROP POLICY IF EXISTS "questions_admin_all" ON questions;
CREATE POLICY "questions_admin_all" ON questions
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = public.user_entity_id()
    )
  );

-- Trainer: read-only
DROP POLICY IF EXISTS "questions_trainer_read" ON questions;
CREATE POLICY "questions_trainer_read" ON questions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = public.user_entity_id()
    )
  );

-- Client: read-only
DROP POLICY IF EXISTS "questions_client_read" ON questions;
CREATE POLICY "questions_client_read" ON questions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = public.user_entity_id()
    )
  );

-- Learner: read questions for active questionnaires in their entity
DROP POLICY IF EXISTS "questions_learner_read" ON questions;
CREATE POLICY "questions_learner_read" ON questions
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires
      WHERE entity_id = public.user_entity_id()
        AND is_active = true
    )
  );


-- ============================================================
-- STEP 16: QUESTIONNAIRE_RESPONSES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access responses" ON questionnaire_responses;

-- Admin: full CRUD for responses for questionnaires in their entity
DROP POLICY IF EXISTS "questionnaire_responses_admin_all" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_admin_all" ON questionnaire_responses
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = public.user_entity_id()
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND questionnaire_id IN (
      SELECT id FROM questionnaires WHERE entity_id = public.user_entity_id()
    )
  );

-- Trainer: read responses for sessions they lead
DROP POLICY IF EXISTS "questionnaire_responses_trainer_read" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_trainer_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
        AND s.entity_id = public.user_entity_id()
    )
  );

-- Learner: insert their own responses and read their own
DROP POLICY IF EXISTS "questionnaire_responses_learner_insert" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_learner_insert" ON questionnaire_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'learner'
    AND learner_id IN (
      SELECT id FROM learners WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "questionnaire_responses_learner_read" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_learner_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
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
DROP POLICY IF EXISTS "document_templates_admin_all" ON document_templates;
CREATE POLICY "document_templates_admin_all" ON document_templates
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "document_templates_trainer_read" ON document_templates;
CREATE POLICY "document_templates_trainer_read" ON document_templates
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: read-only within their entity
DROP POLICY IF EXISTS "document_templates_client_read" ON document_templates;
CREATE POLICY "document_templates_client_read" ON document_templates
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND entity_id = public.user_entity_id()
  );

-- Learner: no access


-- ============================================================
-- STEP 18: GENERATED_DOCUMENTS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access gen_docs" ON generated_documents;

-- Admin: full CRUD for documents linked to their entity
-- (via template, session, or client)
DROP POLICY IF EXISTS "generated_documents_admin_all" ON generated_documents;
CREATE POLICY "generated_documents_admin_all" ON generated_documents
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND (
      template_id IN (
        SELECT id FROM document_templates WHERE entity_id = public.user_entity_id()
      )
      OR session_id IN (
        SELECT id FROM sessions WHERE entity_id = public.user_entity_id()
      )
      OR client_id IN (
        SELECT id FROM clients WHERE entity_id = public.user_entity_id()
      )
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND (
      template_id IN (
        SELECT id FROM document_templates WHERE entity_id = public.user_entity_id()
      )
      OR session_id IN (
        SELECT id FROM sessions WHERE entity_id = public.user_entity_id()
      )
      OR client_id IN (
        SELECT id FROM clients WHERE entity_id = public.user_entity_id()
      )
    )
  );

-- Trainer: read documents for sessions they lead
DROP POLICY IF EXISTS "generated_documents_trainer_read" ON generated_documents;
CREATE POLICY "generated_documents_trainer_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
        AND s.entity_id = public.user_entity_id()
    )
  );

-- Client: read documents for their client record
DROP POLICY IF EXISTS "generated_documents_client_read" ON generated_documents;
CREATE POLICY "generated_documents_client_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'client'
    AND client_id IN (
      SELECT client_id FROM learners WHERE profile_id = auth.uid()
    )
  );

-- Learner: read documents linked to them
DROP POLICY IF EXISTS "generated_documents_learner_read" ON generated_documents;
CREATE POLICY "generated_documents_learner_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND learner_id IN (
      SELECT id FROM learners WHERE profile_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 19: EMAIL_TEMPLATES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access email_templates" ON email_templates;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "email_templates_admin_all" ON email_templates;
CREATE POLICY "email_templates_admin_all" ON email_templates
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "email_templates_trainer_read" ON email_templates;
CREATE POLICY "email_templates_trainer_read" ON email_templates
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: no access
-- Learner: no access


-- ============================================================
-- STEP 20: EMAIL_HISTORY table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access email_history" ON email_history;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "email_history_admin_all" ON email_history;
CREATE POLICY "email_history_admin_all" ON email_history
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: read-only within their entity
DROP POLICY IF EXISTS "email_history_trainer_read" ON email_history;
CREATE POLICY "email_history_trainer_read" ON email_history
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Client: no access
-- Learner: no access


-- ============================================================
-- STEP 21: SIGNATURES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access signatures" ON signatures;

-- Admin: full access for signatures linked to sessions in their entity
DROP POLICY IF EXISTS "signatures_admin_all" ON signatures;
CREATE POLICY "signatures_admin_all" ON signatures
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND (
      session_id IN (
        SELECT id FROM sessions WHERE entity_id = public.user_entity_id()
      )
      OR session_id IS NULL
    )
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND (
      session_id IN (
        SELECT id FROM sessions WHERE entity_id = public.user_entity_id()
      )
      OR session_id IS NULL
    )
  );

-- Trainer: insert their own signatures and read all signatures for their sessions
DROP POLICY IF EXISTS "signatures_trainer_insert" ON signatures;
CREATE POLICY "signatures_trainer_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'trainer'
    AND signer_type = 'trainer'
    AND signer_id = auth.uid()
  );

DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND (
      -- Own signatures
      (signer_type = 'trainer' AND signer_id = auth.uid())
      OR
      -- All signatures for sessions they lead
      session_id IN (
        SELECT s.id FROM sessions s
        JOIN trainers t ON t.id = s.trainer_id
        WHERE t.profile_id = auth.uid()
          AND s.entity_id = public.user_entity_id()
      )
    )
  );

-- Learner: insert their own signature and read their own signatures
DROP POLICY IF EXISTS "signatures_learner_insert" ON signatures;
CREATE POLICY "signatures_learner_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'learner'
    AND signer_type = 'learner'
    AND signer_id = auth.uid()
  );

DROP POLICY IF EXISTS "signatures_learner_read" ON signatures;
CREATE POLICY "signatures_learner_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'learner'
    AND signer_type = 'learner'
    AND signer_id = auth.uid()
  );

-- Client: no access


-- ============================================================
-- STEP 22: CRM_PROSPECTS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_prospects" ON crm_prospects;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "crm_prospects_admin_all" ON crm_prospects;
CREATE POLICY "crm_prospects_admin_all" ON crm_prospects
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 23: CRM_TASKS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_tasks" ON crm_tasks;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "crm_tasks_admin_all" ON crm_tasks;
CREATE POLICY "crm_tasks_admin_all" ON crm_tasks
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 24: CRM_QUOTES table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_quotes" ON crm_quotes;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "crm_quotes_admin_all" ON crm_quotes;
CREATE POLICY "crm_quotes_admin_all" ON crm_quotes
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 25: CRM_CAMPAIGNS table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access crm_campaigns" ON crm_campaigns;

-- Admin: full CRUD within their entity
DROP POLICY IF EXISTS "crm_campaigns_admin_all" ON crm_campaigns;
CREATE POLICY "crm_campaigns_admin_all" ON crm_campaigns
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer, Client, Learner: no access


-- ============================================================
-- STEP 26: ACTIVITY_LOG table
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access activity_log" ON activity_log;

-- Admin: full access within their entity
DROP POLICY IF EXISTS "activity_log_admin_all" ON activity_log;
CREATE POLICY "activity_log_admin_all" ON activity_log
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND entity_id = public.user_entity_id()
  );

-- Trainer: insert their own activity logs and read logs for their entity
DROP POLICY IF EXISTS "activity_log_trainer_insert" ON activity_log;
CREATE POLICY "activity_log_trainer_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "activity_log_trainer_read" ON activity_log;
CREATE POLICY "activity_log_trainer_read" ON activity_log
  FOR SELECT TO authenticated
  USING (
    public.user_role() = 'trainer'
    AND entity_id = public.user_entity_id()
  );

-- Learner: insert their own activity logs only
DROP POLICY IF EXISTS "activity_log_learner_insert" ON activity_log;
CREATE POLICY "activity_log_learner_insert" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'learner'
    AND entity_id = public.user_entity_id()
    AND user_id = auth.uid()
  );

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

DROP POLICY IF EXISTS "client_documents_admin_all" ON client_documents;
CREATE POLICY "client_documents_admin_all" ON client_documents
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- TABLE: referrals (programme de parrainage)
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_code TEXT NOT NULL,
  referrer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_name TEXT,
  referred_email TEXT,
  company_name TEXT,
  is_subscribed BOOLEAN DEFAULT FALSE,
  reward_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Admins can view all referrals for their entity
DROP POLICY IF EXISTS "referrals_admin_read" ON referrals;
CREATE POLICY "referrals_admin_read" ON referrals
  FOR SELECT TO authenticated
  USING (true);

-- Anyone authenticated can insert a referral (during signup)
DROP POLICY IF EXISTS "referrals_insert" ON referrals;
CREATE POLICY "referrals_insert" ON referrals
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admins can update referrals (mark as subscribed, reward paid, etc.)
DROP POLICY IF EXISTS "referrals_admin_update" ON referrals;
CREATE POLICY "referrals_admin_update" ON referrals
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anonymous inserts for signup flow (user just created, not yet fully authenticated)
DROP POLICY IF EXISTS "referrals_anon_insert" ON referrals;
CREATE POLICY "referrals_anon_insert" ON referrals
  FOR INSERT TO anon
  WITH CHECK (true);

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

DROP POLICY IF EXISTS "bpf_financial_data_admin_all" ON bpf_financial_data;
CREATE POLICY "bpf_financial_data_admin_all" ON bpf_financial_data
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

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
-- DONNÉES DE DÉMONSTRATION
-- ============================================================

-- Note: Ces données nécessitent que des users auth existent d'abord.
-- Elles sont à insérer manuellement ou via les scripts de seed.
-- ============================================================
-- Client: no access to activity log
-- Fix: Ensure trainers and trainer_competencies are accessible
-- This re-adds permissive policies that were dropped by rls-granular.sql
-- Run this in the Supabase SQL editor if you see "Impossible de charger les formateurs"

-- Trainers: add fallback permissive policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trainers' AND policyname = 'trainers_authenticated_access'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "trainers_authenticated_access" ON trainers;
CREATE POLICY "trainers_authenticated_access" ON trainers FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Trainer competencies: add fallback permissive policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trainer_competencies' AND policyname = 'trainer_competencies_authenticated_access'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "trainer_competencies_authenticated_access" ON trainer_competencies;
CREATE POLICY "trainer_competencies_authenticated_access" ON trainer_competencies FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
-- Migration: Fix CRM schema - add created_by to crm_tasks
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
-- Migration: CRM Tags system for client/prospect categorization

CREATE TABLE IF NOT EXISTS crm_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, name)
);

CREATE TABLE IF NOT EXISTS crm_prospect_tags (
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES crm_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prospect_id, tag_id)
);

CREATE TABLE IF NOT EXISTS crm_client_tags (
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES crm_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, tag_id)
);

-- Add segment_tags to campaigns for tag-based targeting
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS segment_tags UUID[] DEFAULT '{}';

-- RLS
ALTER TABLE crm_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prospect_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_client_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users full access crm_tags" ON crm_tags;
CREATE POLICY "Auth users full access crm_tags" ON crm_tags
  FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Auth users full access crm_prospect_tags" ON crm_prospect_tags;
CREATE POLICY "Auth users full access crm_prospect_tags" ON crm_prospect_tags
  FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Auth users full access crm_client_tags" ON crm_client_tags;
CREATE POLICY "Auth users full access crm_client_tags" ON crm_client_tags
  FOR ALL TO authenticated USING (true);
-- Migration: CRM Notifications system for task reminders and quote follow-ups

CREATE TABLE IF NOT EXISTS crm_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task_overdue', 'task_due_today', 'task_due_soon', 'quote_followup', 'quote_expiring', 'general')),
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  resource_type TEXT,
  resource_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
DROP POLICY IF EXISTS "Users see own notifications" ON crm_notifications;
CREATE POLICY "Users see own notifications" ON crm_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON crm_notifications;
CREATE POLICY "Users update own notifications" ON crm_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Auth users insert notifications" ON crm_notifications;
CREATE POLICY "Auth users insert notifications" ON crm_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users delete own notifications" ON crm_notifications;
CREATE POLICY "Users delete own notifications" ON crm_notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_crm_notifications_user_unread ON crm_notifications(user_id, is_read) WHERE is_read = FALSE;
-- Migration: Add CRM access flag for sales reps (trainers with CRM access)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_crm_access BOOLEAN DEFAULT FALSE;

-- RLS policies for CRM tables: allow users with has_crm_access to see their own assigned records

-- Prospects: sales reps see only their assigned prospects
DROP POLICY IF EXISTS "CRM sales reps read own prospects" ON crm_prospects;
CREATE POLICY "CRM sales reps read own prospects" ON crm_prospects
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

DROP POLICY IF EXISTS "CRM sales reps update own prospects" ON crm_prospects;
CREATE POLICY "CRM sales reps update own prospects" ON crm_prospects
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

-- Tasks: sales reps see only their assigned tasks
DROP POLICY IF EXISTS "CRM sales reps read own tasks" ON crm_tasks;
CREATE POLICY "CRM sales reps read own tasks" ON crm_tasks
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

DROP POLICY IF EXISTS "CRM sales reps update own tasks" ON crm_tasks;
CREATE POLICY "CRM sales reps update own tasks" ON crm_tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

DROP POLICY IF EXISTS "CRM sales reps insert tasks" ON crm_tasks;
CREATE POLICY "CRM sales reps insert tasks" ON crm_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

-- Quotes: sales reps see only their created quotes
DROP POLICY IF EXISTS "CRM sales reps read own quotes" ON crm_quotes;
CREATE POLICY "CRM sales reps read own quotes" ON crm_quotes
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );

DROP POLICY IF EXISTS "CRM sales reps update own quotes" ON crm_quotes;
CREATE POLICY "CRM sales reps update own quotes" ON crm_quotes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND has_crm_access = TRUE)
  );
-- Migration: Add detailed fields to crm_quotes for devis creation
-- Run this in the Supabase SQL Editor

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS tva DECIMAL(5,2) DEFAULT 20.00;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS training_start DATE;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS training_end DATE;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS effectifs INTEGER;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS duration TEXT;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS mention TEXT DEFAULT 'Conformément à l''article L. 441-6 du Code de Commerce, les pénalités de retard seront calculées à partir de 3 fois le taux d''intérêt légal en vigueur ainsi qu''une indemnité de 40€ seront dues à défaut de règlement le jour suivant la date de paiement figurant sur la facture.';

-- Quote line items
CREATE TABLE IF NOT EXISTS crm_quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES crm_quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_quote_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_quote_lines_all') THEN
    CREATE POLICY crm_quote_lines_all ON crm_quote_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
-- ============================================================
-- E-Learning "Document → Cours Complet" tables
-- ============================================================

-- 1. Courses
CREATE TABLE IF NOT EXISTS elearning_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Source document
  source_file_name TEXT,
  source_file_url TEXT,
  source_file_type TEXT,
  extracted_text TEXT,

  -- Course metadata
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT,
  thumbnail_url TEXT,
  estimated_duration_minutes INTEGER DEFAULT 0,

  -- Workflow
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing','draft','review','published','archived')),
  generation_status TEXT DEFAULT 'pending' CHECK (generation_status IN ('pending','extracting','generating','completed','failed')),
  generation_error TEXT,
  generation_log JSONB DEFAULT '[]',

  language TEXT DEFAULT 'fr',
  difficulty_level TEXT DEFAULT 'intermediate' CHECK (difficulty_level IN ('beginner','intermediate','advanced')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Chapters
CREATE TABLE IF NOT EXISTS elearning_chapters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  title TEXT NOT NULL,
  summary TEXT,
  content_html TEXT,
  content_markdown TEXT,
  key_concepts JSONB DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0,
  estimated_duration_minutes INTEGER DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Quizzes (one per chapter)
CREATE TABLE IF NOT EXISTS elearning_quizzes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID REFERENCES elearning_chapters(id) ON DELETE CASCADE NOT NULL,

  title TEXT NOT NULL DEFAULT 'Quiz',
  passing_score INTEGER DEFAULT 70,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Quiz questions
CREATE TABLE IF NOT EXISTS elearning_quiz_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID REFERENCES elearning_quizzes(id) ON DELETE CASCADE NOT NULL,

  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice','true_false')),
  options JSONB NOT NULL DEFAULT '[]',
  explanation TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Flashcards
CREATE TABLE IF NOT EXISTS elearning_flashcards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID REFERENCES elearning_chapters(id) ON DELETE CASCADE NOT NULL,

  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enrollments
CREATE TABLE IF NOT EXISTS elearning_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,

  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_rate INTEGER DEFAULT 0,

  enrolled_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(course_id, learner_id)
);

-- 7. Chapter progress
CREATE TABLE IF NOT EXISTS elearning_chapter_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES elearning_enrollments(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES elearning_chapters(id) ON DELETE CASCADE NOT NULL,

  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER DEFAULT 0,

  quiz_score INTEGER,
  quiz_passed BOOLEAN DEFAULT FALSE,
  quiz_attempts INTEGER DEFAULT 0,
  last_quiz_answers JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(enrollment_id, chapter_id)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE elearning_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_chapter_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users full access elearning_courses" ON elearning_courses;
CREATE POLICY "Auth users full access elearning_courses" ON elearning_courses FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_chapters" ON elearning_chapters;
CREATE POLICY "Auth users full access elearning_chapters" ON elearning_chapters FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_quizzes" ON elearning_quizzes;
CREATE POLICY "Auth users full access elearning_quizzes" ON elearning_quizzes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_quiz_questions" ON elearning_quiz_questions;
CREATE POLICY "Auth users full access elearning_quiz_questions" ON elearning_quiz_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_flashcards" ON elearning_flashcards;
CREATE POLICY "Auth users full access elearning_flashcards" ON elearning_flashcards FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_enrollments" ON elearning_enrollments;
CREATE POLICY "Auth users full access elearning_enrollments" ON elearning_enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_chapter_progress" ON elearning_chapter_progress;
CREATE POLICY "Auth users full access elearning_chapter_progress" ON elearning_chapter_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_elearning_courses_entity ON elearning_courses(entity_id);
CREATE INDEX IF NOT EXISTS idx_elearning_courses_status ON elearning_courses(status);
CREATE INDEX IF NOT EXISTS idx_elearning_chapters_course ON elearning_chapters(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_elearning_quizzes_chapter ON elearning_quizzes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_elearning_quiz_questions_quiz ON elearning_quiz_questions(quiz_id, order_index);
CREATE INDEX IF NOT EXISTS idx_elearning_flashcards_chapter ON elearning_flashcards(chapter_id, order_index);
CREATE INDEX IF NOT EXISTS idx_elearning_enrollments_learner ON elearning_enrollments(learner_id);
CREATE INDEX IF NOT EXISTS idx_elearning_enrollments_course ON elearning_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_elearning_chapter_progress_enrollment ON elearning_chapter_progress(enrollment_id);

-- ============================================================
-- Storage bucket (run via Supabase dashboard or API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('elearning-documents', 'elearning-documents', false);
-- ============================================================
-- E-Learning V2: Examen Final, Flashcards Globales, Slides, Live
-- ============================================================

-- 1. Final Exam Question Bank (course-level)
CREATE TABLE IF NOT EXISTS elearning_final_exam_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice'
    CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  options JSONB DEFAULT '[]',
  correct_answer TEXT,
  explanation TEXT,

  difficulty INTEGER DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  topic TEXT,
  objective_ref TEXT,
  estimated_time_sec INTEGER DEFAULT 60,
  citations JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',

  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Global Flashcards (course-level)
CREATE TABLE IF NOT EXISTS elearning_global_flashcards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  citations JSONB DEFAULT '[]',

  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Final Exam Progress (per enrollment)
CREATE TABLE IF NOT EXISTS elearning_final_exam_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES elearning_enrollments(id) ON DELETE CASCADE NOT NULL,

  score INTEGER,
  passed BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  last_answers JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(enrollment_id)
);

-- 4. Slide Specs (course-level)
CREATE TABLE IF NOT EXISTS elearning_slide_specs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  slide_spec JSONB NOT NULL DEFAULT '{}',
  version INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Live Sessions
CREATE TABLE IF NOT EXISTS elearning_live_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,
  presenter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  current_slide_index INTEGER DEFAULT 0,
  current_state JSONB DEFAULT '{}',

  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ============================================================
-- ALTER existing tables
-- ============================================================

-- Add generation parameters to courses
ALTER TABLE elearning_courses
  ADD COLUMN IF NOT EXISTS final_quiz_target_count INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS flashcards_target_count INTEGER DEFAULT 80,
  ADD COLUMN IF NOT EXISTS final_exam_passing_score INTEGER DEFAULT 70;

-- Extend question_type CHECK to include short_answer
ALTER TABLE elearning_quiz_questions
  DROP CONSTRAINT IF EXISTS elearning_quiz_questions_question_type_check;
ALTER TABLE elearning_quiz_questions
  ADD CONSTRAINT elearning_quiz_questions_question_type_check
  CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer'));

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE elearning_final_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_global_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_final_exam_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_slide_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_live_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users full access elearning_final_exam_questions" ON elearning_final_exam_questions;
CREATE POLICY "Auth users full access elearning_final_exam_questions" ON elearning_final_exam_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_global_flashcards" ON elearning_global_flashcards;
CREATE POLICY "Auth users full access elearning_global_flashcards" ON elearning_global_flashcards FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_final_exam_progress" ON elearning_final_exam_progress;
CREATE POLICY "Auth users full access elearning_final_exam_progress" ON elearning_final_exam_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_slide_specs" ON elearning_slide_specs;
CREATE POLICY "Auth users full access elearning_slide_specs" ON elearning_slide_specs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users full access elearning_live_sessions" ON elearning_live_sessions;
CREATE POLICY "Auth users full access elearning_live_sessions" ON elearning_live_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_final_exam_questions_course ON elearning_final_exam_questions(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_final_exam_questions_difficulty ON elearning_final_exam_questions(course_id, difficulty);
CREATE INDEX IF NOT EXISTS idx_final_exam_questions_topic ON elearning_final_exam_questions(course_id, topic);
CREATE INDEX IF NOT EXISTS idx_global_flashcards_course ON elearning_global_flashcards(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_final_exam_progress_enrollment ON elearning_final_exam_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_slide_specs_course ON elearning_slide_specs(course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON elearning_live_sessions(course_id, status);
-- Track learner scores per course (best score, last score, attempts)
CREATE TABLE IF NOT EXISTS elearning_course_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  best_score INTEGER NOT NULL DEFAULT 0,        -- best total points
  best_chapter_pct INTEGER NOT NULL DEFAULT 0,  -- best avg chapter quiz %
  best_final_pct INTEGER NOT NULL DEFAULT 0,    -- best final exam %
  last_score INTEGER NOT NULL DEFAULT 0,
  last_chapter_pct INTEGER NOT NULL DEFAULT 0,
  last_final_pct INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(course_id, user_id)
);

ALTER TABLE elearning_course_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage their own scores" ON elearning_course_scores;
CREATE POLICY "Authenticated users can manage their own scores"
  ON elearning_course_scores
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all scores" ON elearning_course_scores;
CREATE POLICY "Admins can view all scores"
  ON elearning_course_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
-- Add per-chapter Gamma presentation fields
ALTER TABLE elearning_chapters
  ADD COLUMN IF NOT EXISTS gamma_deck_id TEXT,
  ADD COLUMN IF NOT EXISTS gamma_deck_url TEXT,
  ADD COLUMN IF NOT EXISTS gamma_embed_url TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pdf TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pptx TEXT,
  ADD COLUMN IF NOT EXISTS gamma_prompt_content TEXT,
  ADD COLUMN IF NOT EXISTS is_enriched BOOLEAN DEFAULT FALSE;

-- Add enrichment tracking to courses
ALTER TABLE elearning_courses
  ADD COLUMN IF NOT EXISTS gamma_prompt_content TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_model TEXT DEFAULT 'gpt-4o';
-- Add Gamma presentation columns to elearning_courses
ALTER TABLE elearning_courses
  ADD COLUMN IF NOT EXISTS gamma_deck_id TEXT,
  ADD COLUMN IF NOT EXISTS gamma_deck_url TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pdf TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pptx TEXT;
-- Single Gamma deck strategy: store embed URL at course level + slide offset per chapter

-- Course-level Gamma fields (single deck for entire course)
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS gamma_embed_url TEXT,
ADD COLUMN IF NOT EXISTS gamma_deck_url TEXT,
ADD COLUMN IF NOT EXISTS gamma_deck_id TEXT;

-- Chapter-level slide start index (which card/slide begins this chapter)
ALTER TABLE elearning_chapters
ADD COLUMN IF NOT EXISTS gamma_slide_start INTEGER DEFAULT 0;
-- Add num_chapters column to control how many chapters the AI generates
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS num_chapters INTEGER DEFAULT 5
CHECK (num_chapters >= 2 AND num_chapters <= 8);
-- Add course_type to control what gets generated
-- "presentation" = Gamma only, "quiz" = Quiz + Flashcards only, "complete" = everything
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS course_type TEXT NOT NULL DEFAULT 'complete'
CHECK (course_type IN ('presentation', 'quiz', 'complete'));

-- Gamma theme and template support
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS gamma_theme_id TEXT,
ADD COLUMN IF NOT EXISTS gamma_template_id TEXT;
-- Add CV columns to trainers table
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS cv_url TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS cv_text TEXT;
-- Add classification column to trainings table
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS classification TEXT;
-- Add is_public column to sessions table for learner self-enrollment
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
-- Add meeting_url column for video conference links (separate from physical location)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS meeting_url TEXT;
-- Add address to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;

-- Create locations table for training venues
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view locations of their entity" ON locations;
CREATE POLICY "Users can view locations of their entity"
  ON locations FOR SELECT
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage locations" ON locations;
CREATE POLICY "Admins can manage locations"
  ON locations FOR ALL
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid() AND role = 'admin'));
-- Migration: Update program "Accompagnement à la Prise de Poste en Secrétariat Médical"
-- Source: PDF bibliotheque VisioFormation

UPDATE programs
SET
  title = 'Accompagnement à la Prise de Poste en Secrétariat Médical',
  description = 'Jour 1 : Découverte du poste et gestion administrative (3,5h)
1. Introduction et prise en main du poste (45min)
• Présentation des missions du secrétaire médical.
• Règles de confidentialité et secret médical.
• Fonctionnement du cabinet, de la clinique ou de l''hôpital.
2. Gestion des tâches administratives (2,75h)
• Organisation et classement des dossiers patients (papier et numérique).
• Utilisation des logiciels médicaux (prise de RDV, dossier patient, télétransmission).
• Gestion des courriers, mails et comptes rendus médicaux.

Jour 2 : Accueil des patients, communication et bureautique (3,5h)
1. Techniques d''accueil et relation avec les patients (1,5h)
• Accueil physique et téléphonique : posture professionnelle et empathie.
• Prise de rendez-vous et gestion des urgences.
• Communication avec les patients et le personnel soignant.
2. Module bureautique (2h)
• Utilisation des outils de bureautique essentiels :
• Word : rédaction et mise en page de documents médicaux.
• Excel : tableaux de suivi, listes de patients, gestion des plannings.
• Outlook : gestion des mails, organisation du travail avec le calendrier.
• Raccourcis et astuces pour gagner en efficacité.

Jour 3 : Approfondissement et mise en situation (3,5h)
1. Gestion des imprévus et priorisation des tâches (2h)
• Gestion des conflits et patients difficiles.
• Organisation et gestion du stress en situation de forte affluence.
2. Mises en situation et validation des acquis (1,5h)
• Exercices pratiques sur la gestion des appels et la prise de rendez-vous.
• Cas pratiques de classement, facturation et gestion administrative.
• Bilan de la formation et conseils personnalisés.',
  objectives = '1 - Comprendre le rôle et les missions du secrétaire médical dans son environnement de travail.
2 - Acquérir les compétences organisationnelles et administratives essentielles.
3 - Maîtriser la gestion des rendez-vous, l''accueil des patients et la communication professionnelle.
4 - Appliquer les règles de confidentialité et de réglementation en milieu médical.',
  content = '{
    "duration_hours": 10.5,
    "duration_days": 3,
    "location": "Formation En présentiel",
    "specialty": "100 - Formations générales",
    "diploma": "Aucun",
    "cpf_eligible": false,
    "target_audience": "Secrétaire médicale",
    "prerequisites": "aucun",
    "team_description": "",
    "evaluation_methods": [
      "Test de positionnement.",
      "Évaluation des acquis (tests, exercices, études de cas et mises en situation)",
      "Évaluation de l''impact de la formation"
    ],
    "pedagogical_resources": [
      "Alternance d''apports théoriques et d''ateliers pratiques pour faire émerger les bonnes pratiques.",
      "Animée alternativement sous forme de formation, d''ateliers de mise en pratique, de groupe de parole, de séance de co-développement",
      "Pour faciliter l''ancrage et conformément à l''ADN MR FORMATION, nos ateliers utilisent la Ludo pédagogie."
    ],
    "certification_results": "",
    "certification_terms": "",
    "certification_details": "",
    "modules": [
      {
        "id": 1,
        "title": "Introduction et prise en main du poste",
        "duration_hours": 0.75,
        "objectives": [],
        "topics": [
          "Présentation des missions du secrétaire médical.",
          "Règles de confidentialité et secret médical.",
          "Fonctionnement du cabinet, de la clinique ou de l''hôpital."
        ]
      },
      {
        "id": 2,
        "title": "Gestion des tâches administratives",
        "duration_hours": 2.75,
        "objectives": [],
        "topics": [
          "Organisation et classement des dossiers patients (papier et numérique).",
          "Utilisation des logiciels médicaux (prise de RDV, dossier patient, télétransmission).",
          "Gestion des courriers, mails et comptes rendus médicaux."
        ]
      },
      {
        "id": 3,
        "title": "Techniques d''accueil et relation avec les patients",
        "duration_hours": 1.5,
        "objectives": [],
        "topics": [
          "Accueil physique et téléphonique : posture professionnelle et empathie.",
          "Prise de rendez-vous et gestion des urgences.",
          "Communication avec les patients et le personnel soignant."
        ]
      },
      {
        "id": 4,
        "title": "Module bureautique",
        "duration_hours": 2,
        "objectives": [],
        "topics": [
          "Utilisation des outils de bureautique essentiels :",
          "Word : rédaction et mise en page de documents médicaux.",
          "Excel : tableaux de suivi, listes de patients, gestion des plannings.",
          "Outlook : gestion des mails, organisation du travail avec le calendrier.",
          "Raccourcis et astuces pour gagner en efficacité."
        ]
      },
      {
        "id": 5,
        "title": "Gestion des imprévus et priorisation des tâches",
        "duration_hours": 2,
        "objectives": [],
        "topics": [
          "Gestion des conflits et patients difficiles.",
          "Organisation et gestion du stress en situation de forte affluence."
        ]
      },
      {
        "id": 6,
        "title": "Mises en situation et validation des acquis",
        "duration_hours": 1.5,
        "objectives": [],
        "topics": [
          "Exercices pratiques sur la gestion des appels et la prise de rendez-vous.",
          "Cas pratiques de classement, facturation et gestion administrative.",
          "Bilan de la formation et conseils personnalisés."
        ]
      }
    ]
  }'::jsonb,
  updated_at = NOW()
WHERE title ILIKE '%Accompagnement%Prise de Poste%Secrétariat Médical%'
   OR title ILIKE '%Accompagnement%Secretariat Medical%';
-- ============================================================
-- CORRECTION SÉCURITÉ — Empêcher l'auto-promotion de rôle
-- À exécuter dans Supabase SQL Editor
-- ============================================================
-- CONTEXTE : La policy "profiles_self_update" permet à un utilisateur
-- de modifier sa propre ligne sans restriction de colonnes.
-- Un apprenant peut donc faire : supabase.from('profiles').update({ role: 'admin' })
-- et se promouvoir administrateur.
--
-- SOLUTION : Restreindre les colonnes modifiables au niveau des privilèges
-- de colonne PostgreSQL. Le rôle `authenticated` ne peut plus toucher
-- `role` ni `entity_id`. Le `service_role` (API routes) bypasse RLS
-- et peut toujours tout modifier.
-- ============================================================

-- 1. Retirer tous les droits UPDATE sur profiles au rôle authenticated
REVOKE UPDATE ON profiles FROM authenticated;

-- 2. Ne re-donner que les colonnes "safe" (infos personnelles uniquement)
GRANT UPDATE (first_name, last_name, phone, avatar_url, updated_at) ON profiles TO authenticated;

-- ============================================================
-- VÉRIFICATION (facultatif) : exécuter cette requête pour confirmer
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_name = 'profiles' AND privilege_type = 'UPDATE';
-- ============================================================
-- Mise à jour des dates created_at des apprenants
-- Tous les apprenants existants → Février 2026
-- Comptes Adrien Coti (test) → Mars 2026
-- ============================================================

-- 1) Tous les apprenants en Février 2026 (dates variées pour réalisme)
UPDATE learners
SET created_at = '2026-02-01'::timestamptz + (random() * interval '27 days')
WHERE lower(first_name) NOT LIKE '%adrien%'
  AND lower(last_name) NOT LIKE '%coti%';

-- 2) Comptes Coti en Mars 2026
UPDATE learners
SET created_at = '2026-03-01 10:00:00+01'
WHERE lower(first_name) LIKE '%coti%'
   OR lower(last_name) LIKE '%coti%';

-- Vérification
SELECT
  to_char(created_at, 'YYYY-MM') AS mois,
  count(*) AS nb_apprenants
FROM learners
GROUP BY 1
ORDER BY 1;
-- ============================================================
-- LMS MR FORMATION - Données de démonstration (seed.sql)
-- Version 1.0 - Février 2026
-- ============================================================
-- IMPORTANT: Ce script suppose que le schema.sql a déjà été
-- exécuté et que les deux entités (MR FORMATION, C3V FORMATION)
-- existent dans la table `entities`.
--
-- Les profils (profiles) sont créés automatiquement par le
-- trigger `on_auth_user_created` lors de la création d'un
-- utilisateur dans Supabase Auth. Il faut donc créer les
-- utilisateurs auth AVANT d'exécuter ce script si vous
-- voulez lier des profils aux formateurs.
--
-- Pour créer des utilisateurs auth :
--   Supabase Dashboard > Authentication > Users > Add user
-- ============================================================

-- ============================================================
-- VARIABLES LOCALES (UUIDs des entités)
-- ============================================================
-- Récupérer l'UUID de MR FORMATION
DO $$
DECLARE
  v_entity_mr   UUID;
  v_entity_c3v  UUID;

  -- Clients
  v_client_1    UUID := gen_random_uuid();
  v_client_2    UUID := gen_random_uuid();
  v_client_3    UUID := gen_random_uuid();
  v_client_4    UUID := gen_random_uuid();

  -- Formateurs
  v_trainer_1   UUID := gen_random_uuid();
  v_trainer_2   UUID := gen_random_uuid();
  v_trainer_3   UUID := gen_random_uuid();

  -- Formations
  v_training_1  UUID := gen_random_uuid();
  v_training_2  UUID := gen_random_uuid();
  v_training_3  UUID := gen_random_uuid();

  -- Sessions
  v_session_1   UUID := gen_random_uuid();
  v_session_2   UUID := gen_random_uuid();
  v_session_3   UUID := gen_random_uuid();

  -- Apprenants
  v_learner_1   UUID := gen_random_uuid();
  v_learner_2   UUID := gen_random_uuid();
  v_learner_3   UUID := gen_random_uuid();
  v_learner_4   UUID := gen_random_uuid();

  -- Prospects CRM
  v_prospect_1  UUID := gen_random_uuid();
  v_prospect_2  UUID := gen_random_uuid();
  v_prospect_3  UUID := gen_random_uuid();
  v_prospect_4  UUID := gen_random_uuid();

  -- Questionnaires
  v_questionnaire_1 UUID := gen_random_uuid();
  v_questionnaire_2 UUID := gen_random_uuid();

  -- Templates email
  v_email_tpl_1 UUID := gen_random_uuid();
  v_email_tpl_2 UUID := gen_random_uuid();

BEGIN

  -- ============================================================
  -- Récupérer les entités
  -- ============================================================
  SELECT id INTO v_entity_mr  FROM entities WHERE slug = 'mr-formation'  LIMIT 1;
  SELECT id INTO v_entity_c3v FROM entities WHERE slug = 'c3v-formation' LIMIT 1;

  IF v_entity_mr IS NULL THEN
    RAISE EXCEPTION 'Entité MR FORMATION introuvable. Assurez-vous d''avoir exécuté schema.sql en premier.';
  END IF;

  IF v_entity_c3v IS NULL THEN
    RAISE EXCEPTION 'Entité C3V FORMATION introuvable. Assurez-vous d''avoir exécuté schema.sql en premier.';
  END IF;

  -- ============================================================
  -- CLIENTS - MR FORMATION (2 clients)
  -- ============================================================
  INSERT INTO clients (id, entity_id, company_name, siret, address, city, postal_code, website, sector, status, notes)
  VALUES
    (
      v_client_1,
      v_entity_mr,
      'Groupe Technika Solutions',
      '82341567800024',
      '14 Rue de la République',
      'Lyon',
      '69001',
      'https://technika-solutions.fr',
      'Informatique & Numérique',
      'active',
      'Client fidèle depuis 2023. Commandes régulières de formations bureautique et cybersécurité.'
    ),
    (
      v_client_2,
      v_entity_mr,
      'BTP Horizon Constructions',
      '73812034500018',
      '8 Avenue des Entrepreneurs',
      'Bordeaux',
      '33000',
      NULL,
      'BTP & Construction',
      'active',
      'Partenariat sur les formations sécurité chantier et habilitations électriques.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CLIENTS - C3V FORMATION (2 clients supplémentaires)
  -- ============================================================
  INSERT INTO clients (id, entity_id, company_name, siret, address, city, postal_code, website, sector, status, notes)
  VALUES
    (
      v_client_3,
      v_entity_c3v,
      'Santé Plus Cliniques',
      '65234178900011',
      '22 Boulevard de la Santé',
      'Toulouse',
      '31000',
      'https://santeplus.fr',
      'Santé & Médico-social',
      'active',
      'Groupe de cliniques privées. Formations en gestes et postures, bientraitance.'
    ),
    (
      v_client_4,
      v_entity_c3v,
      'Mairie de Saint-Emilion',
      '21330072400017',
      '1 Place du Marché',
      'Saint-Emilion',
      '33330',
      'https://saint-emilion.fr',
      'Secteur Public',
      'prospect',
      'Contact pris en janvier 2026. Intéressés par formations management et communication.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CONTACTS des clients
  -- ============================================================
  INSERT INTO contacts (client_id, first_name, last_name, email, phone, job_title, is_primary)
  VALUES
    (v_client_1, 'Sophie',   'Marchand',  's.marchand@technika-solutions.fr',  '04 72 00 11 22', 'Responsable RH',         TRUE),
    (v_client_1, 'David',    'Lecomte',   'd.lecomte@technika-solutions.fr',   '04 72 00 33 44', 'Directeur Technique',    FALSE),
    (v_client_2, 'Pierre',   'Beaumont',  'p.beaumont@btphorizon.fr',          '05 56 00 12 34', 'DRH',                    TRUE),
    (v_client_2, 'Amélie',   'Fontaine',  'a.fontaine@btphorizon.fr',          '05 56 00 56 78', 'Assistante Formation',   FALSE),
    (v_client_3, 'Nathalie', 'Rousseau',  'n.rousseau@santeplus.fr',           '05 61 00 22 33', 'Directrice des Soins',   TRUE),
    (v_client_4, 'François', 'Dupont',    'f.dupont@saint-emilion.fr',         '05 57 24 70 71', 'Directeur Général',      TRUE)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- FORMATEURS (2 pour MR FORMATION, 1 pour C3V FORMATION)
  -- ============================================================
  INSERT INTO trainers (id, entity_id, first_name, last_name, email, phone, type, bio, hourly_rate, availability_notes)
  VALUES
    (
      v_trainer_1,
      v_entity_mr,
      'Jean-Paul',
      'Moreau',
      'jp.moreau@mr-formation.fr',
      '06 12 34 56 78',
      'internal',
      'Formateur expert en bureautique et outils numériques. 15 ans d''expérience en formation professionnelle. Certifié Microsoft Office Specialist.',
      85.00,
      'Disponible lundi au vendredi. Déplacements possibles en Auvergne-Rhône-Alpes.'
    ),
    (
      v_trainer_2,
      v_entity_mr,
      'Isabelle',
      'Garnier',
      'i.garnier@mr-formation.fr',
      '06 98 76 54 32',
      'internal',
      'Spécialisée en management, leadership et communication interpersonnelle. Coach certifiée ICF. 10 ans en RH et formation.',
      95.00,
      'Disponible sur tout le territoire. Téléprésentiel et présentiel.'
    ),
    (
      v_trainer_3,
      v_entity_c3v,
      'Marc',
      'Lefebvre',
      'm.lefebvre@c3v-formation.fr',
      '06 55 44 33 22',
      'external',
      'Consultant indépendant, expert en sécurité au travail et prévention des risques. Intervenant habilité IPRP.',
      110.00,
      'Disponible 3 semaines par mois. Zone Nouvelle-Aquitaine et Occitanie.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- COMPETENCES DES FORMATEURS
  -- ============================================================
  INSERT INTO trainer_competencies (trainer_id, competency, level)
  VALUES
    (v_trainer_1, 'Microsoft Excel',          'expert'),
    (v_trainer_1, 'Microsoft Word',           'expert'),
    (v_trainer_1, 'Microsoft PowerPoint',     'expert'),
    (v_trainer_1, 'Cybersécurité de base',    'intermediate'),
    (v_trainer_1, 'Google Workspace',         'intermediate'),
    (v_trainer_2, 'Management d''équipe',     'expert'),
    (v_trainer_2, 'Communication',            'expert'),
    (v_trainer_2, 'Leadership',               'expert'),
    (v_trainer_2, 'Gestion du stress',        'intermediate'),
    (v_trainer_2, 'Prise de parole',          'expert'),
    (v_trainer_3, 'Sécurité au travail',      'expert'),
    (v_trainer_3, 'Habilitations électriques','expert'),
    (v_trainer_3, 'Gestes et postures',       'expert'),
    (v_trainer_3, 'Prévention des risques',   'expert')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- FORMATIONS (3 au catalogue - entité MR FORMATION)
  -- ============================================================
  INSERT INTO trainings (id, entity_id, title, description, objectives, duration_hours, max_participants, price_per_person, category, certification, prerequisites, is_active)
  VALUES
    (
      v_training_1,
      v_entity_mr,
      'Excel Avancé - Tableaux Croisés Dynamiques et Macros',
      'Formation approfondie sur Microsoft Excel pour utilisateurs intermédiaires souhaitant maîtriser les fonctionnalités avancées : TCD, formules complexes, VBA de base et automatisation.',
      E'- Maîtriser les tableaux croisés dynamiques\n- Créer des formules avancées (INDEX, EQUIV, SUMIFS)\n- Automatiser des tâches répétitives avec les macros VBA\n- Créer des tableaux de bord dynamiques',
      14.00,
      12,
      490.00,
      'Bureautique & Numérique',
      'Attestation de formation Microsoft Excel Avancé',
      'Connaissance de base d''Excel requise (formules simples, mise en forme)',
      TRUE
    ),
    (
      v_training_2,
      v_entity_mr,
      'Management et Leadership - Prendre sa Place de Manager',
      'Formation destinée aux nouveaux managers et managers confirmés souhaitant développer leur posture managériale, renforcer la cohésion de leur équipe et améliorer leur communication.',
      E'- Comprendre les différents styles de management\n- Développer son intelligence émotionnelle\n- Conduire des entretiens individuels efficaces\n- Gérer les conflits et situations difficiles\n- Motiver et fidéliser son équipe',
      21.00,
      10,
      890.00,
      'Management & Leadership',
      'Attestation de formation Management et Leadership',
      'Aucun prérequis. Recommandé pour toute personne en situation de management.',
      TRUE
    ),
    (
      v_training_3,
      v_entity_mr,
      'Sécurité Informatique - Sensibilisation aux Cybermenaces',
      'Formation de sensibilisation à la cybersécurité pour tous les collaborateurs. Comprendre les risques numériques et adopter les bons réflexes au quotidien.',
      E'- Identifier les principales cybermenaces (phishing, ransomware, ingénierie sociale)\n- Adopter les bonnes pratiques de gestion des mots de passe\n- Sécuriser ses communications et ses données\n- Réagir correctement en cas d''incident de sécurité',
      7.00,
      20,
      290.00,
      'Cybersécurité',
      'Attestation de sensibilisation à la cybersécurité',
      'Aucun prérequis technique. Formation accessible à tous les niveaux.',
      TRUE
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- SESSIONS (2 sessions planifiées, 1 terminée)
  -- ============================================================
  INSERT INTO sessions (id, training_id, entity_id, title, start_date, end_date, location, mode, status, max_participants, trainer_id, notes)
  VALUES
    (
      v_session_1,
      v_training_1,
      v_entity_mr,
      'Excel Avancé - Groupe Lyon Mars 2026',
      '2026-03-10 09:00:00+01',
      '2026-03-11 17:00:00+01',
      'Centre de Formation Lyon 2 - Salle Informatique A',
      'presentiel',
      'upcoming',
      12,
      v_trainer_1,
      'Session confirmée. 8 inscrits à ce jour. Salle équipée de 12 postes informatiques avec Excel 2021.'
    ),
    (
      v_session_2,
      v_training_2,
      v_entity_mr,
      'Management - Promotion Hiver 2026',
      '2026-04-07 09:00:00+02',
      '2026-04-09 17:00:00+02',
      'Hôtel Mercure Lyon Centre - Salle Confluence',
      'presentiel',
      'upcoming',
      10,
      v_trainer_2,
      'Session inter-entreprises. Places encore disponibles. Déjeuner inclus.'
    ),
    (
      v_session_3,
      v_training_3,
      v_entity_mr,
      'Cybersécurité - Technika Solutions Janvier 2026',
      '2026-01-15 09:00:00+01',
      '2026-01-15 17:00:00+01',
      'Technika Solutions - Salle de réunion principale',
      'presentiel',
      'upcoming',
      20,
      v_trainer_1,
      'Session intra-entreprise pour Technika Solutions. 18 participants prévus.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- APPRENANTS
  -- ============================================================
  INSERT INTO learners (id, entity_id, client_id, first_name, last_name, email, phone, job_title, created_at)
  VALUES
    (v_learner_1, v_entity_mr, v_client_1, 'Thomas',   'Bernard',  't.bernard@technika-solutions.fr',  '04 72 00 55 66', 'Analyste Données',        '2026-02-03 10:00:00+01'),
    (v_learner_2, v_entity_mr, v_client_1, 'Julie',    'Martin',   'j.martin@technika-solutions.fr',   '04 72 00 77 88', 'Chargée de projet',       '2026-02-10 14:30:00+01'),
    (v_learner_3, v_entity_mr, v_client_2, 'Nicolas',  'Perrin',   'n.perrin@btphorizon.fr',           '05 56 00 90 12', 'Chef de chantier',        '2026-02-15 09:00:00+01'),
    (v_learner_4, v_entity_mr, v_client_2, 'Cécile',   'Dubois',   'c.dubois@btphorizon.fr',           '05 56 00 34 56', 'Conductrice de travaux',  '2026-02-20 11:15:00+01')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- INSCRIPTIONS AUX SESSIONS
  -- ============================================================
  INSERT INTO enrollments (session_id, learner_id, client_id, status, completion_rate)
  VALUES
    -- Session Excel Mars 2026
    (v_session_1, v_learner_1, v_client_1, 'confirmed',  0),
    (v_session_1, v_learner_2, v_client_1, 'confirmed',  0),
    -- Session Management Avril 2026
    (v_session_2, v_learner_3, v_client_2, 'registered', 0),
    -- Session Cybersécurité (à venir)
    (v_session_3, v_learner_1, v_client_1, 'confirmed',  0),
    (v_session_3, v_learner_2, v_client_1, 'confirmed',  0)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- QUESTIONNAIRES
  -- ============================================================
  INSERT INTO questionnaires (id, entity_id, title, description, type, is_active)
  VALUES
    (
      v_questionnaire_1,
      v_entity_mr,
      'Questionnaire de satisfaction - Formation standard',
      'Questionnaire envoyé à tous les apprenants à la fin de chaque session de formation.',
      'satisfaction',
      TRUE
    ),
    (
      v_questionnaire_2,
      v_entity_mr,
      'Evaluation des acquis - Pré / Post formation',
      'Questionnaire d''évaluation des connaissances avant et après la formation pour mesurer la progression.',
      'evaluation',
      TRUE
    )
  ON CONFLICT DO NOTHING;

  -- Questions du questionnaire de satisfaction
  INSERT INTO questions (questionnaire_id, text, type, options, order_index, is_required)
  VALUES
    (v_questionnaire_1, 'Comment évaluez-vous la qualité globale de la formation ?',
     'rating', NULL, 1, TRUE),
    (v_questionnaire_1, 'Le formateur était-il pédagogue et disponible pour répondre aux questions ?',
     'rating', NULL, 2, TRUE),
    (v_questionnaire_1, 'Le contenu de la formation correspondait-il à vos attentes ?',
     'rating', NULL, 3, TRUE),
    (v_questionnaire_1, 'Recommanderiez-vous cette formation à un collègue ?',
     'yes_no', NULL, 4, TRUE),
    (v_questionnaire_1, 'Quels points pourraient être améliorés dans cette formation ?',
     'text', NULL, 5, FALSE),
    (v_questionnaire_1, 'Quel est votre niveau de satisfaction général ?',
     'multiple_choice',
     '["Très satisfait(e)", "Satisfait(e)", "Peu satisfait(e)", "Pas satisfait(e)"]',
     6, TRUE)
  ON CONFLICT DO NOTHING;

  -- Réponse exemple (session terminée)
  INSERT INTO questionnaire_responses (questionnaire_id, session_id, learner_id, responses, submitted_at)
  VALUES
    (
      v_questionnaire_1,
      v_session_3,
      v_learner_1,
      '{
        "q1": 5,
        "q2": 4,
        "q3": 5,
        "q4": true,
        "q5": "Les exercices pratiques étaient très bien. Peut-être un peu plus de temps sur les macros VBA.",
        "q6": "Très satisfait(e)"
      }',
      '2026-01-15 17:30:00+01'
    ),
    (
      v_questionnaire_1,
      v_session_3,
      v_learner_2,
      '{
        "q1": 4,
        "q2": 5,
        "q3": 4,
        "q4": true,
        "q5": "Formation très complète. Le formateur est excellent.",
        "q6": "Très satisfait(e)"
      }',
      '2026-01-15 17:45:00+01'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- MODELES D'EMAILS
  -- ============================================================
  INSERT INTO email_templates (id, entity_id, name, subject, body, type, variables)
  VALUES
    (
      v_email_tpl_1,
      v_entity_mr,
      'Confirmation d''inscription à une session',
      'Confirmation de votre inscription - {{session_title}}',
      E'Bonjour {{first_name}} {{last_name}},\n\nNous avons bien enregistré votre inscription à la formation suivante :\n\n- Formation : {{training_title}}\n- Session : {{session_title}}\n- Dates : {{session_dates}}\n- Lieu : {{session_location}}\n- Formateur : {{trainer_name}}\n\nVeuillez vous présenter 10 minutes avant le début de la formation avec une pièce d''identité.\n\nEn cas d''empêchement, merci de nous prévenir au plus tôt à l''adresse : contact@mr-formation.fr\n\nCordialement,\nL''équipe MR FORMATION\nTél : 04 XX XX XX XX\ncontact@mr-formation.fr',
      'confirmation',
      '["first_name", "last_name", "session_title", "training_title", "session_dates", "session_location", "trainer_name"]'
    ),
    (
      v_email_tpl_2,
      v_entity_mr,
      'Rappel J-7 avant la session',
      'Rappel - Votre formation {{training_title}} commence dans 7 jours',
      E'Bonjour {{first_name}},\n\nVotre formation approche ! Voici un rappel des informations pratiques :\n\n- Formation : {{training_title}}\n- Date de début : {{start_date}}\n- Lieu : {{session_location}}\n- Formateur : {{trainer_name}}\n\nPensez à apporter :\n- Une pièce d''identité\n- De quoi prendre des notes\n\nNous vous souhaitons une excellente formation.\n\nCordialement,\nL''équipe MR FORMATION',
      'reminder',
      '["first_name", "training_title", "start_date", "session_location", "trainer_name"]'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CRM - PROSPECTS
  -- ============================================================
  INSERT INTO crm_prospects (id, entity_id, company_name, siret, contact_name, email, phone, status, source, notes)
  VALUES
    (
      v_prospect_1,
      v_entity_mr,
      'Industrie Métallurgique Rhône',
      '45123678900034',
      'Gérard Morin',
      'g.morin@imrhone.fr',
      '04 78 99 11 22',
      'qualified',
      'Appel entrant',
      'Besoin de formations habilitations électriques pour 25 techniciens. Budget annuel ~15 000€. Décision en mars 2026.'
    ),
    (
      v_prospect_2,
      v_entity_mr,
      'Cabinet Comptable Fiduciaire Loire',
      '31456789000012',
      'Martine Chevalier',
      'm.chevalier@fiduciaire-loire.fr',
      '04 77 22 33 44',
      'contacted',
      'Salon RH Paris 2025',
      'Rencontre au salon RH. Intéressés par les formations Excel et PowerBI. Relance prévue le 25/02/2026.'
    ),
    (
      v_prospect_3,
      v_entity_mr,
      'LogiTrans Frères et Associés',
      '56234890100023',
      'Patrick Renaud',
      'p.renaud@logitrans.fr',
      '06 70 80 90 11',
      'proposal',
      'Recommandation client',
      'Devis envoyé le 10/02/2026 pour 3 sessions de formation gestes et postures (45 salariés). En attente de retour.'
    ),
    (
      v_prospect_4,
      v_entity_mr,
      'Ecole Privée Saint-Nicolas',
      '19269001400028',
      'Marie-Christine Blanc',
      'mc.blanc@ecole-saintnicolas.fr',
      '04 73 11 22 33',
      'new',
      'Site web',
      'Formulaire de contact reçu le 18/02/2026. Besoin de formations management pour directeurs de site.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CRM - TACHES
  -- ============================================================
  INSERT INTO crm_tasks (entity_id, title, description, status, priority, due_date, prospect_id)
  VALUES
    (
      v_entity_mr,
      'Envoyer le devis à Industrie Métallurgique Rhône',
      'Préparer et envoyer le devis pour 25 habilitations électriques B1V-BR-BC. Inclure les dates disponibles en avril-mai 2026.',
      'pending',
      'high',
      '2026-02-28',
      v_prospect_1
    ),
    (
      v_entity_mr,
      'Relancer Cabinet Fiduciaire Loire',
      'Relance téléphonique pour qualifier le besoin Excel/PowerBI. Proposer une démo ou une formation découverte.',
      'pending',
      'medium',
      '2026-02-25',
      v_prospect_2
    ),
    (
      v_entity_mr,
      'Suivre le devis LogiTrans - Réponse attendue',
      'Relancer Patrick Renaud si pas de réponse au devis d''ici le 17/02. Le devis expire le 15/03/2026.',
      'in_progress',
      'high',
      '2026-02-24',
      v_prospect_3
    ),
    (
      v_entity_mr,
      'Contacter Ecole Saint-Nicolas - Prise de RDV',
      'Appeler Marie-Christine Blanc pour qualifier le besoin et fixer un rendez-vous de présentation.',
      'pending',
      'medium',
      '2026-02-22',
      v_prospect_4
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- CRM - DEVIS
  -- ============================================================
  INSERT INTO crm_quotes (entity_id, reference, prospect_id, amount, status, valid_until, notes)
  VALUES
    (
      v_entity_mr,
      'DEV-2026-0012',
      v_prospect_3,
      4350.00,
      'sent',
      '2026-03-15',
      'Devis pour 3 sessions de formation Gestes et Postures - 45 salariés répartis en 3 groupes de 15. Prix unitaire 290€/personne.'
    ),
    (
      v_entity_mr,
      'DEV-2026-0013',
      v_prospect_1,
      NULL,
      'draft',
      '2026-03-31',
      'Devis en cours de préparation pour 25 habilitations électriques. En attente du programme détaillé.'
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- FIN DU SCRIPT
  -- ============================================================
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Seed data inserted successfully!';
  RAISE NOTICE '  - 4 clients (2 MR FORMATION, 2 C3V FORMATION)';
  RAISE NOTICE '  - 6 contacts client';
  RAISE NOTICE '  - 3 formateurs (2 MR FORMATION, 1 C3V FORMATION)';
  RAISE NOTICE '  - 14 compétences formateurs';
  RAISE NOTICE '  - 3 formations au catalogue';
  RAISE NOTICE '  - 3 sessions (2 a venir, 1 terminee)';
  RAISE NOTICE '  - 4 apprenants';
  RAISE NOTICE '  - 5 inscriptions';
  RAISE NOTICE '  - 2 questionnaires + 6 questions + 2 reponses';
  RAISE NOTICE '  - 2 modeles d''email';
  RAISE NOTICE '  - 4 prospects CRM';
  RAISE NOTICE '  - 4 taches CRM';
  RAISE NOTICE '  - 2 devis CRM';
  RAISE NOTICE '====================================================';

END $$;
