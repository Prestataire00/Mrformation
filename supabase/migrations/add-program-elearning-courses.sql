-- Pédagogie V2 Epic 1 — Table de jointure N-M programs ↔ elearning_courses
-- (defaults du template programme).
--
-- À la création d'une session basée sur un programme, ces lignes sont
-- copiées (snapshot) vers session_elearning_courses, en convertissant
-- is_mandatory_before_session_default → is_mandatory_before_session et
-- allow_free_progress_default → allow_free_progress.
--
-- Décision Phase 3 brainstorm 2026-06-04 (pattern programme=template).
-- Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md

CREATE TABLE IF NOT EXISTS program_elearning_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  elearning_course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  is_mandatory_before_session_default BOOLEAN NOT NULL DEFAULT false,
  allow_free_progress_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, elearning_course_id)
);

CREATE INDEX IF NOT EXISTS idx_program_elearning_courses_program_id
  ON program_elearning_courses(program_id);
CREATE INDEX IF NOT EXISTS idx_program_elearning_courses_elearning_course_id
  ON program_elearning_courses(elearning_course_id);

ALTER TABLE program_elearning_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sec_select_program_elearning_courses ON program_elearning_courses;
CREATE POLICY sec_select_program_elearning_courses
  ON program_elearning_courses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM programs p
      WHERE p.id = program_elearning_courses.program_id
        AND (
          public.user_role() = 'super_admin'
          OR p.entity_id = public.user_entity_id()
        )
    )
  );

DROP POLICY IF EXISTS sec_insert_program_elearning_courses ON program_elearning_courses;
CREATE POLICY sec_insert_program_elearning_courses
  ON program_elearning_courses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM programs p
      WHERE p.id = program_elearning_courses.program_id
        AND (
          public.user_role() = 'super_admin'
          OR (public.user_role() = 'admin' AND p.entity_id = public.user_entity_id())
        )
    )
  );

DROP POLICY IF EXISTS sec_update_program_elearning_courses ON program_elearning_courses;
CREATE POLICY sec_update_program_elearning_courses
  ON program_elearning_courses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM programs p
      WHERE p.id = program_elearning_courses.program_id
        AND (
          public.user_role() = 'super_admin'
          OR (public.user_role() = 'admin' AND p.entity_id = public.user_entity_id())
        )
    )
  );

DROP POLICY IF EXISTS sec_delete_program_elearning_courses ON program_elearning_courses;
CREATE POLICY sec_delete_program_elearning_courses
  ON program_elearning_courses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM programs p
      WHERE p.id = program_elearning_courses.program_id
        AND (
          public.user_role() = 'super_admin'
          OR (public.user_role() = 'admin' AND p.entity_id = public.user_entity_id())
        )
    )
  );

COMMENT ON TABLE program_elearning_courses IS
  'Pédagogie V2 Epic 1 — Defaults e-learning du programme template. Snapshot vers session_elearning_courses à la création de session.';
