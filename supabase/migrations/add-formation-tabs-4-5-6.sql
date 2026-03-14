-- ============================================================
-- Migration: Onglets 4 (Émargements), 5 (Absences), 6 (Docs Partagés)
-- ============================================================

-- 1. Ajouter time_slot_id optionnel sur signatures (émargement par créneau)
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS time_slot_id UUID REFERENCES formation_time_slots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_signatures_time_slot ON signatures(time_slot_id);

-- 2. Table: formation_absences
CREATE TABLE IF NOT EXISTS formation_absences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  time_slot_id UUID REFERENCES formation_time_slots(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'unjustified' CHECK (status IN ('justified', 'unjustified', 'excused')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formation_absences_session ON formation_absences(session_id);
CREATE INDEX IF NOT EXISTS idx_formation_absences_learner ON formation_absences(learner_id);

-- 3. Table: formation_documents
CREATE TABLE IF NOT EXISTS formation_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('learner', 'program_support', 'common', 'private', 'trainer', 'common_trainer')),
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_formation_documents_session ON formation_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_formation_documents_category ON formation_documents(session_id, category);

-- 4. RLS
ALTER TABLE formation_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "formation_absences_entity_access" ON formation_absences
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_absences.session_id
      AND p.id = auth.uid()
    )
  );

CREATE POLICY "formation_documents_entity_access" ON formation_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_documents.session_id
      AND p.id = auth.uid()
    )
  );
