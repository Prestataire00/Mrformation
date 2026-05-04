-- ============================================================
-- 🚀 RLS CLEANUP MASTER — À EXÉCUTER UNE SEULE FOIS DANS SUPABASE
-- ============================================================
-- Concatène 5 migrations en une seule exécution :
--   1. Helpers public.user_role / user_entity_id
--   2. cleanup_allow_all_phase2a (19 tables : drop allow_all)
--   3. cleanup_allow_all_phase2b_lot1_elearning (12 tables e-learning)
--   4. cleanup_allow_all_phase2b_lots24 (autres tables)
--   5. cleanup_allow_all_phase2b_lots35 (autres tables)
--
-- Idempotent : tu peux le rejouer sans risque (DROP IF EXISTS / CREATE OR REPLACE).
-- Durée d'exécution attendue : 5-15 secondes.
-- ============================================================

-- ── 1/5 HELPERS ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $func$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$func$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_entity_id()
RETURNS UUID AS $func$
  SELECT entity_id FROM public.profiles WHERE id = auth.uid()
$func$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_entity_id() TO authenticated, anon;


-- ════════════════════════════════════════════════════════════
-- FROM: supabase/migrations/cleanup_allow_all_phase2a.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Migration : Cleanup allow_all Phase 2A
-- ============================================================
-- DROP des policies `USING(true)` sur 19 tables qui ont DÉJÀ une
-- policy granulaire prête à prendre le relais.
--
-- Pour les 31 autres tables sans granulaire, voir Phase 2B
-- (création de policies granulaires + DROP allow_all).
--
-- ⚠️ TEST APRÈS APPLICATION :
--   - Login admin : dashboard, formations, clients, CRM, rapports
--   - Login trainer : ses sessions visibles
--   - Login client : son espace visible
--   - Login learner : ses formations visibles
--
-- Si une feature casse → c'est qu'un composant front fait du Supabase
-- direct via anon_key (au lieu de passer par une route API). Identifier
-- le composant et soit le migrer vers une route API, soit ajouter une
-- policy granulaire pour le rôle concerné.
--
-- ROLLBACK : recréer la policy permissive pour la table fautive :
--   CREATE POLICY "allow_all" ON <table> FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
-- ============================================================

-- 1-17. Tables avec policy nommée "allow_all"
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON activity_log;
DROP POLICY IF EXISTS "allow_all" ON clients;
DROP POLICY IF EXISTS "allow_all" ON contacts;
DROP POLICY IF EXISTS "allow_all" ON crm_campaigns;
DROP POLICY IF EXISTS "allow_all" ON crm_notifications;
DROP POLICY IF EXISTS "allow_all" ON crm_prospects;
DROP POLICY IF EXISTS "allow_all" ON crm_quotes;
DROP POLICY IF EXISTS "allow_all" ON crm_tags;
DROP POLICY IF EXISTS "allow_all" ON crm_tasks;
DROP POLICY IF EXISTS "allow_all" ON document_templates;
DROP POLICY IF EXISTS "allow_all" ON email_history;
DROP POLICY IF EXISTS "allow_all" ON email_templates;
DROP POLICY IF EXISTS "allow_all" ON enrollments;
DROP POLICY IF EXISTS "allow_all" ON learners;
DROP POLICY IF EXISTS "allow_all" ON programs;
DROP POLICY IF EXISTS "allow_all" ON sessions;
DROP POLICY IF EXISTS "allow_all" ON trainers;

-- 18-19. Tables avec autre nom de policy permissive (qual = true)
-- ============================================================
DROP POLICY IF EXISTS "quality_scores_read_all" ON quality_scores;
DROP POLICY IF EXISTS "questionnaire_sessions_admin_all" ON questionnaire_sessions;

-- ============================================================
-- Vérification (à exécuter après) :
--
-- 1. Confirme qu'aucune policy permissive ne reste sur ces tables :
--   SELECT tablename, policyname, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND qual = 'true'
--     AND tablename IN (
--       'activity_log','clients','contacts','crm_campaigns',
--       'crm_notifications','crm_prospects','crm_quotes','crm_tags',
--       'crm_tasks','document_templates','email_history','email_templates',
--       'enrollments','learners','programs','quality_scores',
--       'questionnaire_sessions','sessions','trainers'
--     );
-- (devrait retourner 0 lignes)
--
-- 2. Test isolation cross-tenant :
--   SET ROLE authenticated;
--   -- Simuler un user de l'entité X qui essaye de lire l'entité Y
--   SELECT COUNT(*) FROM learners; -- ne doit retourner QUE les learners de son entity
--   RESET ROLE;
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- FROM: supabase/migrations/cleanup_allow_all_phase2b_lot1_elearning.sql
-- ════════════════════════════════════════════════════════════
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

DROP POLICY IF EXISTS "elearning_courses_admin_all" ON elearning_courses;
CREATE POLICY "elearning_courses_admin_all" ON elearning_courses
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

DROP POLICY IF EXISTS "elearning_courses_other_roles_read" ON elearning_courses;
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

DROP POLICY IF EXISTS "elearning_chapters_admin_all" ON elearning_chapters;
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

DROP POLICY IF EXISTS "elearning_chapters_read" ON elearning_chapters;
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

DROP POLICY IF EXISTS "elearning_global_flashcards_admin_all" ON elearning_global_flashcards;
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

DROP POLICY IF EXISTS "elearning_global_flashcards_read" ON elearning_global_flashcards;
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

DROP POLICY IF EXISTS "elearning_slide_specs_admin_all" ON elearning_slide_specs;
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

DROP POLICY IF EXISTS "elearning_slide_specs_read" ON elearning_slide_specs;
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

DROP POLICY IF EXISTS "elearning_final_exam_questions_admin_all" ON elearning_final_exam_questions;
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

DROP POLICY IF EXISTS "elearning_final_exam_questions_read" ON elearning_final_exam_questions;
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

DROP POLICY IF EXISTS "elearning_live_sessions_admin_all" ON elearning_live_sessions;
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

DROP POLICY IF EXISTS "elearning_live_sessions_read" ON elearning_live_sessions;
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

DROP POLICY IF EXISTS "elearning_quizzes_admin_all" ON elearning_quizzes;
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

DROP POLICY IF EXISTS "elearning_quizzes_read" ON elearning_quizzes;
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

DROP POLICY IF EXISTS "elearning_flashcards_admin_all" ON elearning_flashcards;
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

DROP POLICY IF EXISTS "elearning_flashcards_read" ON elearning_flashcards;
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

DROP POLICY IF EXISTS "elearning_quiz_questions_admin_all" ON elearning_quiz_questions;
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

DROP POLICY IF EXISTS "elearning_quiz_questions_read" ON elearning_quiz_questions;
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

DROP POLICY IF EXISTS "elearning_enrollments_admin_all" ON elearning_enrollments;
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

DROP POLICY IF EXISTS "elearning_enrollments_trainer_read" ON elearning_enrollments;
CREATE POLICY "elearning_enrollments_trainer_read" ON elearning_enrollments
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND course_id IN (SELECT id FROM elearning_courses WHERE entity_id = user_entity_id())
  );

DROP POLICY IF EXISTS "elearning_enrollments_learner_own" ON elearning_enrollments;
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

DROP POLICY IF EXISTS "elearning_chapter_progress_admin_all" ON elearning_chapter_progress;
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

DROP POLICY IF EXISTS "elearning_chapter_progress_learner_own" ON elearning_chapter_progress;
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

DROP POLICY IF EXISTS "elearning_final_exam_progress_admin_all" ON elearning_final_exam_progress;
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

DROP POLICY IF EXISTS "elearning_final_exam_progress_learner_own" ON elearning_final_exam_progress;
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

DROP POLICY IF EXISTS "elearning_course_scores_admin_all" ON elearning_course_scores;
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

DROP POLICY IF EXISTS "elearning_course_scores_self" ON elearning_course_scores;
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

-- ════════════════════════════════════════════════════════════
-- FROM: supabase/migrations/cleanup_allow_all_phase2b_lots24.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Migration : Cleanup allow_all Phase 2B - Lots B2 + B4
-- ============================================================
-- Crée les policies granulaires manquantes sur 6 tables, puis
-- DROP les `allow_all` qui les annulaient.
--
-- Lot B2 (Documents/signatures) : generated_documents, signatures, prospect_comments
-- Lot B4 (Trainings/Programs)   : program_versions, trainings, trainer_competencies
--
-- Pattern : admin/super_admin filtré par entity_id (directe ou via JOIN),
-- + autres rôles (trainer/client/learner) avec accès en lecture quand légitime.
--
-- ⚠️ TEST APRÈS APPLICATION :
--   - Catalogue formations (page /admin/trainings)
--   - Création/édition de session avec génération de documents
--   - Page formation [id] : tabs ConventionDocs, Émargements, DocsPartages
--   - Page CRM Prospects : commentaires
--   - Page Trainers : compétences
--
-- ROLLBACK : recréer la policy permissive sur la table fautive :
--   CREATE POLICY "allow_all" ON <table> FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
-- ============================================================

-- 1. trainings (entity_id direct — le plus simple)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON trainings;
DROP POLICY IF EXISTS "trainings_admin_all" ON trainings;
DROP POLICY IF EXISTS "trainings_trainer_read" ON trainings;
DROP POLICY IF EXISTS "trainings_client_read" ON trainings;
DROP POLICY IF EXISTS "trainings_learner_read" ON trainings;

DROP POLICY IF EXISTS "trainings_admin_all" ON trainings;
CREATE POLICY "trainings_admin_all" ON trainings
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

DROP POLICY IF EXISTS "trainings_other_roles_read" ON trainings;
CREATE POLICY "trainings_other_roles_read" ON trainings
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = user_entity_id()
  );

-- 2. program_versions (entity_id via programs)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON program_versions;
DROP POLICY IF EXISTS "program_versions_admin_all" ON program_versions;
DROP POLICY IF EXISTS "program_versions_trainer_read" ON program_versions;

DROP POLICY IF EXISTS "program_versions_admin_all" ON program_versions;
CREATE POLICY "program_versions_admin_all" ON program_versions
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND program_id IN (SELECT id FROM programs WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND program_id IN (SELECT id FROM programs WHERE entity_id = user_entity_id())
  );

DROP POLICY IF EXISTS "program_versions_trainer_read" ON program_versions;
CREATE POLICY "program_versions_trainer_read" ON program_versions
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND program_id IN (SELECT id FROM programs WHERE entity_id = user_entity_id())
  );

-- 3. trainer_competencies (entity_id via trainers)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_admin_all" ON trainer_competencies;
DROP POLICY IF EXISTS "trainer_competencies_self" ON trainer_competencies;

DROP POLICY IF EXISTS "trainer_competencies_admin_all" ON trainer_competencies;
CREATE POLICY "trainer_competencies_admin_all" ON trainer_competencies
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND trainer_id IN (SELECT id FROM trainers WHERE entity_id = user_entity_id())
  );

DROP POLICY IF EXISTS "trainer_competencies_self" ON trainer_competencies;
CREATE POLICY "trainer_competencies_self" ON trainer_competencies
  FOR ALL TO authenticated
  USING (
    user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    user_role() = 'trainer'
    AND trainer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- 4. prospect_comments (entity_id via crm_prospects, admin only)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON prospect_comments;
DROP POLICY IF EXISTS "prospect_comments_admin_all" ON prospect_comments;

DROP POLICY IF EXISTS "prospect_comments_admin_all" ON prospect_comments;
CREATE POLICY "prospect_comments_admin_all" ON prospect_comments
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
    AND author_id = auth.uid()
  );

-- 5. signatures (entity_id via sessions)
-- ============================================================
-- ⚠️ Les routes publiques (/api/emargement/sign) utilisent service_role
-- → bypass RLS, pas affectées. Les composants admin lisent via session.
DROP POLICY IF EXISTS "allow_all" ON signatures;
DROP POLICY IF EXISTS "signatures_admin_all" ON signatures;
DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
DROP POLICY IF EXISTS "signatures_learner_read" ON signatures;

DROP POLICY IF EXISTS "signatures_admin_all" ON signatures;
CREATE POLICY "signatures_admin_all" ON signatures
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
  );

DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "signatures_learner_read" ON signatures;
CREATE POLICY "signatures_learner_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    user_role() = 'learner'
    AND signer_type = 'learner'
    AND signer_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- 6. generated_documents (entity_id via session_id ou client_id ou learner_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_admin_all" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_trainer_read" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_client_read" ON generated_documents;
DROP POLICY IF EXISTS "generated_documents_learner_read" ON generated_documents;

DROP POLICY IF EXISTS "generated_documents_admin_all" ON generated_documents;
CREATE POLICY "generated_documents_admin_all" ON generated_documents
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND (
      session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
      OR client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
      OR learner_id IN (SELECT id FROM learners WHERE entity_id = user_entity_id())
    )
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND (
      session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
      OR client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
      OR learner_id IN (SELECT id FROM learners WHERE entity_id = user_entity_id())
    )
  );

DROP POLICY IF EXISTS "generated_documents_trainer_read" ON generated_documents;
CREATE POLICY "generated_documents_trainer_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "generated_documents_client_read" ON generated_documents;
CREATE POLICY "generated_documents_client_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'client'
    AND client_id IN (SELECT client_id FROM learners WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "generated_documents_learner_read" ON generated_documents;
CREATE POLICY "generated_documents_learner_read" ON generated_documents
  FOR SELECT TO authenticated
  USING (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- ============================================================
-- Vérification (à exécuter après) :
--
-- 1. Confirme qu'aucune policy permissive ne reste sur ces 6 tables :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename IN ('trainings','program_versions','trainer_competencies',
--                       'prospect_comments','signatures','generated_documents');
-- (devrait retourner 0 lignes)
--
-- 2. Compte total restant (devrait passer de ~29 à ~23) :
--   SELECT COUNT(DISTINCT tablename) FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename NOT IN ('entities','learner_access_tokens','signing_tokens',
--                           'pappers_cache','training_domains');
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- FROM: supabase/migrations/cleanup_allow_all_phase2b_lots35.sql
-- ════════════════════════════════════════════════════════════
-- ============================================================
-- Migration : Cleanup allow_all Phase 2B - Lots B3 + B5
-- ============================================================
-- 9 tables : questionnaires, questions, questionnaire_responses,
--            crm_client_tags, crm_prospect_tags, crm_quote_lines,
--            crm_automation_rules, locations, referrals
--
-- ⚠️ TEST APRÈS APPLICATION :
--   - Page /admin/questionnaires : liste + création + voir réponses
--   - Page formation [id] : tab Évaluation, tab Satisfaction (utilisent questions+responses)
--   - Page CRM Prospects : ajout/retrait de tags
--   - Page CRM Quotes : édition d'un devis (lignes)
--   - Page CRM Automations : liste des règles
--   - Page /admin/lieux : CRUD locations
--   - Création de session avec sélection de location
--
-- ROLLBACK : recréer la policy permissive sur la table fautive.
-- ============================================================

-- 1. questionnaires (entity_id direct)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_admin_all" ON questionnaires;
DROP POLICY IF EXISTS "questionnaires_other_roles_read" ON questionnaires;

DROP POLICY IF EXISTS "questionnaires_admin_all" ON questionnaires;
CREATE POLICY "questionnaires_admin_all" ON questionnaires
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

DROP POLICY IF EXISTS "questionnaires_other_roles_read" ON questionnaires;
CREATE POLICY "questionnaires_other_roles_read" ON questionnaires
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = user_entity_id()
  );

-- 2. questions (via questionnaire_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON questions;
DROP POLICY IF EXISTS "questions_admin_all" ON questions;
DROP POLICY IF EXISTS "questions_other_roles_read" ON questions;

DROP POLICY IF EXISTS "questions_admin_all" ON questions;
CREATE POLICY "questions_admin_all" ON questions
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  );

DROP POLICY IF EXISTS "questions_other_roles_read" ON questions;
CREATE POLICY "questions_other_roles_read" ON questions
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  );

-- 3. questionnaire_responses (via questionnaire_id + learner ownership)
-- ============================================================
-- ⚠️ /api/questionnaire/public-submit utilise service_role → bypass RLS
DROP POLICY IF EXISTS "allow_all" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_admin_all" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_trainer_read" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_learner_read" ON questionnaire_responses;
DROP POLICY IF EXISTS "questionnaire_responses_learner_insert" ON questionnaire_responses;

DROP POLICY IF EXISTS "questionnaire_responses_admin_all" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_admin_all" ON questionnaire_responses
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND questionnaire_id IN (SELECT id FROM questionnaires WHERE entity_id = user_entity_id())
  );

DROP POLICY IF EXISTS "questionnaire_responses_trainer_read" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_trainer_read" ON questionnaire_responses
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN trainers t ON t.id = s.trainer_id
      WHERE t.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "questionnaire_responses_learner_own" ON questionnaire_responses;
CREATE POLICY "questionnaire_responses_learner_own" ON questionnaire_responses
  FOR ALL TO authenticated
  USING (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    user_role() = 'learner'
    AND learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
  );

-- 4. crm_client_tags (jonction via client_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_client_tags;
DROP POLICY IF EXISTS "crm_client_tags_admin_all" ON crm_client_tags;

DROP POLICY IF EXISTS "crm_client_tags_admin_all" ON crm_client_tags;
CREATE POLICY "crm_client_tags_admin_all" ON crm_client_tags
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND client_id IN (SELECT id FROM clients WHERE entity_id = user_entity_id())
  );

-- 5. crm_prospect_tags (jonction via prospect_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_prospect_tags;
DROP POLICY IF EXISTS "crm_prospect_tags_admin_all" ON crm_prospect_tags;

DROP POLICY IF EXISTS "crm_prospect_tags_admin_all" ON crm_prospect_tags;
CREATE POLICY "crm_prospect_tags_admin_all" ON crm_prospect_tags
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND prospect_id IN (SELECT id FROM crm_prospects WHERE entity_id = user_entity_id())
  );

-- 6. crm_quote_lines (via quote_id)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_quote_lines;
DROP POLICY IF EXISTS "crm_quote_lines_all" ON crm_quote_lines;
DROP POLICY IF EXISTS "crm_quote_lines_admin_all" ON crm_quote_lines;

DROP POLICY IF EXISTS "crm_quote_lines_admin_all" ON crm_quote_lines;
CREATE POLICY "crm_quote_lines_admin_all" ON crm_quote_lines
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND quote_id IN (SELECT id FROM crm_quotes WHERE entity_id = user_entity_id())
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND quote_id IN (SELECT id FROM crm_quotes WHERE entity_id = user_entity_id())
  );

-- 7. crm_automation_rules (entity_id direct)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON crm_automation_rules;
DROP POLICY IF EXISTS "crm_automation_rules_admin" ON crm_automation_rules;
DROP POLICY IF EXISTS "crm_automation_rules_admin_all" ON crm_automation_rules;

DROP POLICY IF EXISTS "crm_automation_rules_admin_all" ON crm_automation_rules;
CREATE POLICY "crm_automation_rules_admin_all" ON crm_automation_rules
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

-- 8. locations (entity_id direct, lecture pour tous les rôles car utilisé en planning)
-- ============================================================
DROP POLICY IF EXISTS "allow_all" ON locations;
DROP POLICY IF EXISTS "Users can view locations of their entity" ON locations;
DROP POLICY IF EXISTS "locations_admin_all" ON locations;
DROP POLICY IF EXISTS "locations_other_roles_read" ON locations;

DROP POLICY IF EXISTS "locations_admin_all" ON locations;
CREATE POLICY "locations_admin_all" ON locations
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id())
  WITH CHECK (user_role() IN ('admin', 'super_admin') AND entity_id = user_entity_id());

DROP POLICY IF EXISTS "locations_other_roles_read" ON locations;
CREATE POLICY "locations_other_roles_read" ON locations
  FOR SELECT TO authenticated
  USING (
    user_role() IN ('trainer', 'client', 'learner')
    AND entity_id = user_entity_id()
  );

-- 9. referrals (programme de parrainage cross-entité)
-- ============================================================
-- Pas de colonne entity_id : c'est un programme global. On restreint la
-- lecture aux admins/super_admins. L'insert reste ouvert (user qui parraine).
DROP POLICY IF EXISTS "allow_all" ON referrals;
DROP POLICY IF EXISTS "referrals_admin_read" ON referrals;
DROP POLICY IF EXISTS "referrals_insert" ON referrals;
DROP POLICY IF EXISTS "referrals_admin_update" ON referrals;

DROP POLICY IF EXISTS "referrals_admin_all" ON referrals;
CREATE POLICY "referrals_admin_all" ON referrals
  FOR ALL TO authenticated
  USING (user_role() IN ('admin', 'super_admin'))
  WITH CHECK (user_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "referrals_self_insert" ON referrals;
CREATE POLICY "referrals_self_insert" ON referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_user_id = auth.uid());

-- ============================================================
-- Vérification (à exécuter après) :
--
-- 1. Plus aucune policy permissive sur ces 9 tables :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename IN ('questionnaires','questions','questionnaire_responses',
--                       'crm_client_tags','crm_prospect_tags','crm_quote_lines',
--                       'crm_automation_rules','locations','referrals');
-- (devrait retourner 0 lignes)
--
-- 2. Compte total restant (devrait passer de ~23 à ~14) :
--   SELECT COUNT(DISTINCT tablename) FROM pg_policies
--   WHERE schemaname = 'public' AND qual = 'true'
--     AND tablename NOT IN ('entities','learner_access_tokens','signing_tokens',
--                           'pappers_cache','training_domains');
-- ============================================================
