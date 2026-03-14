-- ============================================================
-- Migration: Onglet 12 (e-Learning) — attribution cours e-learning par formation
-- ============================================================

CREATE TABLE IF NOT EXISTS formation_elearning_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
  elearning_enrollment_id UUID REFERENCES elearning_enrollments(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  -- Suivi du temps (secondes)
  time_elearning_modules INTEGER DEFAULT 0,
  time_elearning_evaluations INTEGER DEFAULT 0,
  time_other_evaluations INTEGER DEFAULT 0,
  time_virtual_classroom INTEGER DEFAULT 0,
  time_signed_attendance INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, learner_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_fela_session ON formation_elearning_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_fela_learner ON formation_elearning_assignments(session_id, learner_id);

ALTER TABLE formation_elearning_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fela_entity_access" ON formation_elearning_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_elearning_assignments.session_id
      AND p.id = auth.uid()
    )
  );
