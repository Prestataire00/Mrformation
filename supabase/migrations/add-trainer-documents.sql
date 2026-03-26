-- ============================================================
-- Migration: Ajouter la table trainer_documents
-- Permet aux formateurs d'uploader des documents de session
-- (feuilles d'émargement, évaluations, comptes-rendus…)
-- et des documents administratifs (CV, diplômes, certifications…)
-- ============================================================

-- ── Table trainer_courses (si pas encore créée) ──────────────────────────────

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'trainer_courses_admin_all'
  ) THEN
    CREATE POLICY "trainer_courses_admin_all" ON trainer_courses
      FOR ALL TO authenticated
      USING (
        is_admin_role()
        AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
      )
      WITH CHECK (
        is_admin_role()
        AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'trainer_courses_trainer_own'
  ) THEN
    CREATE POLICY "trainer_courses_trainer_own" ON trainer_courses
      FOR ALL TO authenticated
      USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'trainer'
        AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
      )
      WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'trainer'
        AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
      );
  END IF;
END $$;

-- ── Table trainer_documents ──────────────────────────────────────────────────

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
  USING (
    is_admin_role()
    AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    is_admin_role()
    AND entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "trainer_documents_trainer_own" ON trainer_documents
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );
