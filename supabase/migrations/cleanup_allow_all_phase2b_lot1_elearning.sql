-- ============================================================
-- Migration : Cleanup allow_all Phase 2B - Lot B1 (e-learning)
-- ============================================================
-- 13 tables :
--   - elearning_courses (entity_id direct)
--   - elearning_chapters, elearning_global_flashcards, elearning_slide_specs,
--     elearning_final_exam_questions, elearning_live_sessions, elearning_enrollments
--     → via course_id
--   - elearning_quizzes, elearning_flashcards → via chapter_id → course_id
--   - elearning_quiz_questions → via quiz_id → chapter_id → course_id
--   - elearning_course_scores → course_id + user_id direct
--   - elearning_chapter_progress, elearning_final_exam_progress → via enrollment_id
--
-- Pattern : admin/super_admin filtré par entity_id, learner filtré par
-- ses propres enrollments / scores.
--
-- ⚠️ TEST APRÈS APPLICATION :
--   - Page /admin/elearning : liste cours, création
--   - Édition cours : chapitres, quiz, flashcards
--   - Présentation live (page /present/[courseId])
--   - Espace learner : suivi e-learning, quiz, scores
--
-- ROLLBACK : recréer la policy permissive sur la table fautive.
-- ============================================================

-- 1. elearning_courses (entity_id direct)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_courses;
DROP POLICY IF EXISTS "elearning_courses_admin_all" ON elearning_courses;
DROP POLICY IF EXISTS "elearning_courses_other_roles_read" ON elearning_courses;

CREATE POLICY "elearning_courses_admin_all" ON elearning_courses
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

CREATE POLICY "elearning_courses_other_roles_read" ON elearning_courses
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = user_entity_id()
  );

-- 2. elearning_chapters (via course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_chapters;
DROP POLICY IF EXISTS "elearning_chapters_admin_all" ON elearning_chapters;
DROP POLICY IF EXISTS "elearning_chapters_read" ON elearning_chapters;

CREATE POLICY "elearning_chapters_admin_all" ON elearning_chapters
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_chapters_read" ON elearning_chapters
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

-- 3. elearning_global_flashcards (via course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_global_flashcards;
DROP POLICY IF EXISTS "elearning_global_flashcards_admin_all" ON elearning_global_flashcards;
DROP POLICY IF EXISTS "elearning_global_flashcards_read" ON elearning_global_flashcards;

CREATE POLICY "elearning_global_flashcards_admin_all" ON elearning_global_flashcards
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_global_flashcards_read" ON elearning_global_flashcards
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

-- 4. elearning_slide_specs (via course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_slide_specs;
DROP POLICY IF EXISTS "elearning_slide_specs_admin_all" ON elearning_slide_specs;
DROP POLICY IF EXISTS "elearning_slide_specs_read" ON elearning_slide_specs;

CREATE POLICY "elearning_slide_specs_admin_all" ON elearning_slide_specs
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_slide_specs_read" ON elearning_slide_specs
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

-- 5. elearning_final_exam_questions (via course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_final_exam_questions;
DROP POLICY IF EXISTS "elearning_final_exam_questions_admin_all" ON elearning_final_exam_questions;
DROP POLICY IF EXISTS "elearning_final_exam_questions_read" ON elearning_final_exam_questions;

CREATE POLICY "elearning_final_exam_questions_admin_all" ON elearning_final_exam_questions
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_final_exam_questions_read" ON elearning_final_exam_questions
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'learner')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

-- 6. elearning_live_sessions (via course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_live_sessions;
DROP POLICY IF EXISTS "elearning_live_sessions_admin_all" ON elearning_live_sessions;
DROP POLICY IF EXISTS "elearning_live_sessions_read" ON elearning_live_sessions;

CREATE POLICY "elearning_live_sessions_admin_all" ON elearning_live_sessions
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_live_sessions_read" ON elearning_live_sessions
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('client', 'learner')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

-- 7. elearning_quizzes (via chapter_id → course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_quizzes;
DROP POLICY IF EXISTS "elearning_quizzes_admin_all" ON elearning_quizzes;
DROP POLICY IF EXISTS "elearning_quizzes_read" ON elearning_quizzes;

CREATE POLICY "elearning_quizzes_admin_all" ON elearning_quizzes
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND chapter_id IN (
      SELECT c.id FROM elearning_chapters c
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND chapter_id IN (
      SELECT c.id FROM elearning_chapters c
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

CREATE POLICY "elearning_quizzes_read" ON elearning_quizzes
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'learner')
    AND chapter_id IN (
      SELECT c.id FROM elearning_chapters c
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

-- 8. elearning_flashcards (via chapter_id → course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_flashcards;
DROP POLICY IF EXISTS "elearning_flashcards_admin_all" ON elearning_flashcards;
DROP POLICY IF EXISTS "elearning_flashcards_read" ON elearning_flashcards;

CREATE POLICY "elearning_flashcards_admin_all" ON elearning_flashcards
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND chapter_id IN (
      SELECT c.id FROM elearning_chapters c
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND chapter_id IN (
      SELECT c.id FROM elearning_chapters c
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

CREATE POLICY "elearning_flashcards_read" ON elearning_flashcards
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'learner')
    AND chapter_id IN (
      SELECT c.id FROM elearning_chapters c
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

-- 9. elearning_quiz_questions (via quiz_id → chapter_id → course_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_quiz_questions;
DROP POLICY IF EXISTS "elearning_quiz_questions_admin_all" ON elearning_quiz_questions;
DROP POLICY IF EXISTS "elearning_quiz_questions_read" ON elearning_quiz_questions;

CREATE POLICY "elearning_quiz_questions_admin_all" ON elearning_quiz_questions
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND quiz_id IN (
      SELECT q.id FROM elearning_quizzes q
      JOIN elearning_chapters c ON c.id = q.chapter_id
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND quiz_id IN (
      SELECT q.id FROM elearning_quizzes q
      JOIN elearning_chapters c ON c.id = q.chapter_id
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

CREATE POLICY "elearning_quiz_questions_read" ON elearning_quiz_questions
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'learner')
    AND quiz_id IN (
      SELECT q.id FROM elearning_quizzes q
      JOIN elearning_chapters c ON c.id = q.chapter_id
      JOIN elearning_courses co ON co.id = c.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

-- 10. elearning_enrollments (via course_id) + learner own
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_enrollments;
DROP POLICY IF EXISTS "elearning_enrollments_admin_all" ON elearning_enrollments;
DROP POLICY IF EXISTS "elearning_enrollments_learner_own" ON elearning_enrollments;
DROP POLICY IF EXISTS "elearning_enrollments_trainer_read" ON elearning_enrollments;

CREATE POLICY "elearning_enrollments_admin_all" ON elearning_enrollments
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_enrollments_trainer_read" ON elearning_enrollments
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_enrollments_learner_own" ON elearning_enrollments
  FOR ALL TO authenticated
  USING (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- 11. elearning_chapter_progress (via enrollment_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_chapter_progress;
DROP POLICY IF EXISTS "elearning_chapter_progress_admin_all" ON elearning_chapter_progress;
DROP POLICY IF EXISTS "elearning_chapter_progress_learner_own" ON elearning_chapter_progress;

CREATE POLICY "elearning_chapter_progress_admin_all" ON elearning_chapter_progress
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN elearning_courses co ON co.id = e.course_id
      WHERE co.entity_id = user_entity_id()
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN elearning_courses co ON co.id = e.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

CREATE POLICY "elearning_chapter_progress_learner_own" ON elearning_chapter_progress
  FOR ALL TO authenticated
  USING (
    user_role() = 'learner'
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN learners l ON l.id = e.learner_id
      WHERE l.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    user_role() = 'learner'
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN learners l ON l.id = e.learner_id
      WHERE l.profile_id = auth.uid()
    )
  );

-- 12. elearning_final_exam_progress (via enrollment_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_final_exam_progress;
DROP POLICY IF EXISTS "elearning_final_exam_progress_admin_all" ON elearning_final_exam_progress;
DROP POLICY IF EXISTS "elearning_final_exam_progress_learner_own" ON elearning_final_exam_progress;

CREATE POLICY "elearning_final_exam_progress_admin_all" ON elearning_final_exam_progress
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN elearning_courses co ON co.id = e.course_id
      WHERE co.entity_id = user_entity_id()
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN elearning_courses co ON co.id = e.course_id
      WHERE co.entity_id = user_entity_id()
    )
  );

CREATE POLICY "elearning_final_exam_progress_learner_own" ON elearning_final_exam_progress
  FOR ALL TO authenticated
  USING (
    user_role() = 'learner'
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN learners l ON l.id = e.learner_id
      WHERE l.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    user_role() = 'learner'
    AND enrollment_id IN (
      SELECT e.id FROM elearning_enrollments e
      JOIN learners l ON l.id = e.learner_id
      WHERE l.profile_id = auth.uid()
    )
  );

-- 13. elearning_course_scores (course_id + user_id direct)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON elearning_course_scores;
DROP POLICY IF EXISTS "elearning_course_scores_admin_all" ON elearning_course_scores;
DROP POLICY IF EXISTS "elearning_course_scores_self" ON elearning_course_scores;

CREATE POLICY "elearning_course_scores_admin_all" ON elearning_course_scores
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin', 'trainer')
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

CREATE POLICY "elearning_course_scores_self" ON elearning_course_scores
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Vérification (à exécuter après) :
--
-- 1. Plus aucune policy permissive sur ces 13 tables :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename LIKE 'elearning_%';
-- (devrait retourner 0 lignes)
--
-- 2. Compte total restant (devrait passer de ~14 à 1 — uniquement profiles) :
--   SELECT tablename FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename NOT IN ('entities','learner_access_tokens','signing_tokens',
--                           'pappers_cache','training_domains');
-- ============================================================
