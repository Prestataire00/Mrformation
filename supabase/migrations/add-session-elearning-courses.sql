-- Pédagogie V2 Epic 1 — Table de jointure N-M sessions ↔ elearning_courses
-- avec paramètres pédagogiques par lien.
--
-- À la création d'une session, on copy depuis program_elearning_courses
-- vers ici (snapshot du template, sessions deviennent indépendantes).
-- L'admin peut ensuite add/remove des e-learning à cette session précise.
--
-- Décision Phase 3 brainstorm 2026-06-04 (option B : snapshot à la création).
-- Spec : bmad_output/planning-artifacts/spec-restructuration-pedagogique-2026-06-04.md

CREATE TABLE IF NOT EXISTS session_elearning_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  elearning_course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  is_mandatory_before_session BOOLEAN NOT NULL DEFAULT false,
  allow_free_progress BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, elearning_course_id)
);

CREATE INDEX IF NOT EXISTS idx_session_elearning_courses_session_id
  ON session_elearning_courses(session_id);
CREATE INDEX IF NOT EXISTS idx_session_elearning_courses_elearning_course_id
  ON session_elearning_courses(elearning_course_id);

ALTER TABLE session_elearning_courses ENABLE ROW LEVEL SECURITY;

-- Policy SELECT : autorisé si l'utilisateur a accès à la session parente
-- (via son entity_id) — pattern EXISTS join, pas de duplication colonne.
DROP POLICY IF EXISTS sec_select_session_elearning_courses ON session_elearning_courses;
CREATE POLICY sec_select_session_elearning_courses
  ON session_elearning_courses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_elearning_courses.session_id
        AND (
          public.user_role() = 'super_admin'
          OR s.entity_id = public.user_entity_id()
        )
    )
  );

DROP POLICY IF EXISTS sec_insert_session_elearning_courses ON session_elearning_courses;
CREATE POLICY sec_insert_session_elearning_courses
  ON session_elearning_courses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_elearning_courses.session_id
        AND (
          public.user_role() = 'super_admin'
          OR (public.user_role() = 'admin' AND s.entity_id = public.user_entity_id())
        )
    )
  );

DROP POLICY IF EXISTS sec_update_session_elearning_courses ON session_elearning_courses;
CREATE POLICY sec_update_session_elearning_courses
  ON session_elearning_courses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_elearning_courses.session_id
        AND (
          public.user_role() = 'super_admin'
          OR (public.user_role() = 'admin' AND s.entity_id = public.user_entity_id())
        )
    )
  );

DROP POLICY IF EXISTS sec_delete_session_elearning_courses ON session_elearning_courses;
CREATE POLICY sec_delete_session_elearning_courses
  ON session_elearning_courses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_elearning_courses.session_id
        AND (
          public.user_role() = 'super_admin'
          OR (public.user_role() = 'admin' AND s.entity_id = public.user_entity_id())
        )
    )
  );

COMMENT ON TABLE session_elearning_courses IS
  'Pédagogie V2 Epic 1 — Snapshot des e-learning attachés à une session. Hérité depuis program_elearning_courses à la création (option B Phase 3 brainstorm 2026-06-04), surchargeable manuellement par l''admin.';
