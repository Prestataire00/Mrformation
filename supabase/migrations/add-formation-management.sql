-- ============================================================
-- Migration: Formation Management Enhancement
-- Fusionne le concept Training+Session en "Formation"
-- Ajoute time_slots, multi-trainers, companies, financiers, comments
-- ============================================================

-- 1. Nouvelles colonnes sur sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'intra' CHECK (type IN ('intra', 'inter'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS planned_hours DECIMAL(10,2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS visio_link TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_planned BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS catalog_pre_registration BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Table: formation_time_slots (créneaux pour Planning + Parcours)
CREATE TABLE IF NOT EXISTS formation_time_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  slot_order INTEGER DEFAULT 0,
  module_title TEXT,
  module_objectives TEXT,
  module_themes TEXT,
  module_exercises TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table: formation_trainers (many-to-many sessions <-> trainers)
CREATE TABLE IF NOT EXISTS formation_trainers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'formateur',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, trainer_id)
);

-- 4. Table: formation_companies (entreprises liées à la formation)
CREATE TABLE IF NOT EXISTS formation_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount DECIMAL(10,2),
  email TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, client_id)
);

-- 5. Table: formation_financiers (financeurs)
CREATE TABLE IF NOT EXISTS formation_financiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('opco', 'pole_emploi', 'cpf', 'entreprise', 'region', 'autre')),
  reference TEXT,
  amount DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Table: formation_comments (commentaires internes)
CREATE TABLE IF NOT EXISTS formation_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Index pour performance
CREATE INDEX IF NOT EXISTS idx_formation_time_slots_session ON formation_time_slots(session_id);
CREATE INDEX IF NOT EXISTS idx_formation_time_slots_order ON formation_time_slots(session_id, slot_order);
CREATE INDEX IF NOT EXISTS idx_formation_trainers_session ON formation_trainers(session_id);
CREATE INDEX IF NOT EXISTS idx_formation_trainers_trainer ON formation_trainers(trainer_id);
CREATE INDEX IF NOT EXISTS idx_formation_companies_session ON formation_companies(session_id);
CREATE INDEX IF NOT EXISTS idx_formation_financiers_session ON formation_financiers(session_id);
CREATE INDEX IF NOT EXISTS idx_formation_comments_session ON formation_comments(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_manager ON sessions(manager_id);
CREATE INDEX IF NOT EXISTS idx_sessions_program ON sessions(program_id);

-- 8. RLS sur toutes les nouvelles tables
ALTER TABLE formation_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_financiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_comments ENABLE ROW LEVEL SECURITY;

-- Policies: accès via la session liée (même entity_id)
CREATE POLICY "formation_time_slots_entity_access" ON formation_time_slots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_time_slots.session_id
      AND p.id = auth.uid()
    )
  );

CREATE POLICY "formation_trainers_entity_access" ON formation_trainers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_trainers.session_id
      AND p.id = auth.uid()
    )
  );

CREATE POLICY "formation_companies_entity_access" ON formation_companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_companies.session_id
      AND p.id = auth.uid()
    )
  );

CREATE POLICY "formation_financiers_entity_access" ON formation_financiers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_financiers.session_id
      AND p.id = auth.uid()
    )
  );

CREATE POLICY "formation_comments_entity_access" ON formation_comments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_comments.session_id
      AND p.id = auth.uid()
    )
  );
