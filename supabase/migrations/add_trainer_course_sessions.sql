-- ============================================================
-- Migration: trainer_course_sessions
-- Lie un support de cours formateur (trainer_courses) à une session
-- pour exposer ses fichiers aux apprenants inscrits.
-- ============================================================

CREATE TABLE IF NOT EXISTS trainer_course_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_course_id UUID NOT NULL REFERENCES trainer_courses(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES sessions(id)        ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES entities(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trainer_course_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_tcs_session ON trainer_course_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_tcs_course  ON trainer_course_sessions(trainer_course_id);

ALTER TABLE trainer_course_sessions ENABLE ROW LEVEL SECURITY;

-- Admin (même entité) : accès complet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tcs_admin_all') THEN
    CREATE POLICY "tcs_admin_all" ON trainer_course_sessions
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

-- Formateur : gère les liens de SES supports vers SES sessions assignées
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tcs_trainer_manage_own') THEN
    CREATE POLICY "tcs_trainer_manage_own" ON trainer_course_sessions
      FOR ALL TO authenticated
      USING (
        trainer_course_id IN (
          SELECT tc.id FROM trainer_courses tc
          WHERE tc.trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
        )
      )
      WITH CHECK (
        trainer_course_id IN (
          SELECT tc.id FROM trainer_courses tc
          WHERE tc.trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
        )
        AND session_id IN (
          SELECT session_id FROM formation_trainers
          WHERE trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
        )
      );
  END IF;
END $$;

-- Apprenant : lecture des liens d'un support PUBLIÉ vers une session où il est inscrit
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tcs_learner_read') THEN
    CREATE POLICY "tcs_learner_read" ON trainer_course_sessions
      FOR SELECT TO authenticated
      USING (
        trainer_course_id IN (SELECT id FROM trainer_courses WHERE status = 'published')
        AND session_id IN (
          SELECT session_id FROM enrollments
          WHERE learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
        )
      );
  END IF;
END $$;
