-- ============================================================
-- MIGRATION : Inscription des apprenants aux parcours de formation
-- Tables : program_enrollments, program_module_progress
-- ============================================================

-- 0. Fonctions helper dans public (auth schema protégé sur Supabase hébergé)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_entity_id()
RETURNS UUID AS $$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 1. Table program_enrollments
CREATE TABLE IF NOT EXISTS program_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE NOT NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed')),
  completion_rate INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, learner_id)
);

-- 2. Table program_module_progress
CREATE TABLE IF NOT EXISTS program_module_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES program_enrollments(id) ON DELETE CASCADE NOT NULL,
  module_id INTEGER NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enrollment_id, module_id)
);

-- 3. Index
CREATE INDEX idx_program_enrollments_program ON program_enrollments(program_id);
CREATE INDEX idx_program_enrollments_learner ON program_enrollments(learner_id);
CREATE INDEX idx_program_enrollments_client ON program_enrollments(client_id);
CREATE INDEX idx_program_module_progress_enrollment ON program_module_progress(enrollment_id);

-- 4. RLS
ALTER TABLE program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_module_progress ENABLE ROW LEVEL SECURITY;

-- program_enrollments: admin full access (même entité)
CREATE POLICY "program_enrollments_admin_all" ON program_enrollments
  FOR ALL TO authenticated
  USING (
    public.get_user_role() IN ('admin','super_admin')
    AND program_id IN (SELECT id FROM programs WHERE entity_id = public.get_user_entity_id())
  )
  WITH CHECK (
    public.get_user_role() IN ('admin','super_admin')
    AND program_id IN (SELECT id FROM programs WHERE entity_id = public.get_user_entity_id())
  );

-- program_enrollments: trainer lecture seule
CREATE POLICY "program_enrollments_trainer_read" ON program_enrollments
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'trainer'
    AND program_id IN (SELECT id FROM programs WHERE entity_id = public.get_user_entity_id())
  );

-- program_enrollments: client lecture apprenants de son entreprise
CREATE POLICY "program_enrollments_client_read" ON program_enrollments
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'client'
    AND client_id IN (
      SELECT c.id FROM clients c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.entity_id = p.entity_id
    )
  );

-- program_enrollments: apprenant lecture propre inscription
CREATE POLICY "program_enrollments_learner_read" ON program_enrollments
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- program_module_progress: admin full access
CREATE POLICY "program_module_progress_admin_all" ON program_module_progress
  FOR ALL TO authenticated
  USING (
    public.get_user_role() IN ('admin','super_admin')
    AND enrollment_id IN (
      SELECT pe.id FROM program_enrollments pe
      JOIN programs p ON p.id = pe.program_id
      WHERE p.entity_id = public.get_user_entity_id()
    )
  )
  WITH CHECK (
    public.get_user_role() IN ('admin','super_admin')
    AND enrollment_id IN (
      SELECT pe.id FROM program_enrollments pe
      JOIN programs p ON p.id = pe.program_id
      WHERE p.entity_id = public.get_user_entity_id()
    )
  );

-- program_module_progress: trainer lecture
CREATE POLICY "program_module_progress_trainer_read" ON program_module_progress
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'trainer'
    AND enrollment_id IN (
      SELECT pe.id FROM program_enrollments pe
      JOIN programs p ON p.id = pe.program_id
      WHERE p.entity_id = public.get_user_entity_id()
    )
  );

-- program_module_progress: client lecture
CREATE POLICY "program_module_progress_client_read" ON program_module_progress
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'client'
    AND enrollment_id IN (
      SELECT pe.id FROM program_enrollments pe
      WHERE pe.client_id IN (
        SELECT c.id FROM clients c
        JOIN profiles p ON p.id = auth.uid()
        WHERE c.entity_id = p.entity_id
      )
    )
  );

-- program_module_progress: apprenant lecture propre progression
CREATE POLICY "program_module_progress_learner_read" ON program_module_progress
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'learner'
    AND enrollment_id IN (
      SELECT pe.id FROM program_enrollments pe
      WHERE pe.learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
    )
  );
