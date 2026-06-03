-- ============================================================
-- Migration : EL-1 audit BMAD — Drop des policies legacy
--             "Auth users full access elearning_*"
-- ============================================================
--
-- Constat audit BMAD :
-- Les migrations `add-elearning-courses.sql:139-145` et
-- `add-elearning-v2.sql:111-115` ont créé 12 policies du type
-- "Auth users full access elearning_X" avec `USING(true) WITH CHECK(true)`.
--
-- La migration `cleanup_allow_all_phase2b_lot1_elearning.sql` a ajouté
-- des policies propres (admin_all + entity_id filter), mais N'A PAS
-- droppé les policies originelles. PostgreSQL combine les policies en
-- OR pour une même action, donc si la legacy `USING(true)` survit,
-- **TOUT authenticated peut tout lire/écrire cross-entité**.
--
-- Cette migration drop explicitement les 12 policies legacy. Idempotent
-- (DROP POLICY IF EXISTS). À exécuter manuellement dans le Supabase
-- Dashboard SQL Editor.
--
-- Tables couvertes (12) :
--   elearning_chapter_progress, elearning_chapters, elearning_courses,
--   elearning_enrollments, elearning_final_exam_progress,
--   elearning_final_exam_questions, elearning_flashcards,
--   elearning_global_flashcards, elearning_live_sessions,
--   elearning_quiz_questions, elearning_quizzes, elearning_slide_specs
--
-- Ces tables ont déjà leurs policies propres (admin_all + reads
-- granulaires par rôle) via la migration cleanup. Après ce drop :
-- - admins/super_admins : accès complet à leur entité (cf admin_all)
-- - trainers/clients/learners : SELECT-only selon les policies _read
-- - autres : aucun accès
-- ============================================================

DROP POLICY IF EXISTS "Auth users full access elearning_chapter_progress" ON elearning_chapter_progress;
DROP POLICY IF EXISTS "Auth users full access elearning_chapters" ON elearning_chapters;
DROP POLICY IF EXISTS "Auth users full access elearning_courses" ON elearning_courses;
DROP POLICY IF EXISTS "Auth users full access elearning_enrollments" ON elearning_enrollments;
DROP POLICY IF EXISTS "Auth users full access elearning_final_exam_progress" ON elearning_final_exam_progress;
DROP POLICY IF EXISTS "Auth users full access elearning_final_exam_questions" ON elearning_final_exam_questions;
DROP POLICY IF EXISTS "Auth users full access elearning_flashcards" ON elearning_flashcards;
DROP POLICY IF EXISTS "Auth users full access elearning_global_flashcards" ON elearning_global_flashcards;
DROP POLICY IF EXISTS "Auth users full access elearning_live_sessions" ON elearning_live_sessions;
DROP POLICY IF EXISTS "Auth users full access elearning_quiz_questions" ON elearning_quiz_questions;
DROP POLICY IF EXISTS "Auth users full access elearning_quizzes" ON elearning_quizzes;
DROP POLICY IF EXISTS "Auth users full access elearning_slide_specs" ON elearning_slide_specs;
