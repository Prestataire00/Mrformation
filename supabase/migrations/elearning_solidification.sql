-- ============================================================
-- Solidification e-learning — 2026-05-22
-- 1. course_source sur la table-pont + retrait de la FK course_id
-- 2. RPC atomiques : recalcul de progression, publication gardée
-- A executer dans le Dashboard Supabase (SQL Editor).
-- ============================================================

-- 1. Table-pont : un cours attribué peut venir des 2 mondes
ALTER TABLE formation_elearning_assignments
  ADD COLUMN IF NOT EXISTS course_source TEXT NOT NULL DEFAULT 'ai'
  CHECK (course_source IN ('ai', 'program'));

-- course_id devient une reference polymorphe (ai → elearning_courses,
-- program → programs) : la FK mono-cible et son ON DELETE CASCADE sont retires.
ALTER TABLE formation_elearning_assignments
  DROP CONSTRAINT IF EXISTS formation_elearning_assignments_course_id_fkey;

-- 2a. Recalcul atomique et idempotent de la progression d'une inscription
CREATE OR REPLACE FUNCTION elearning_recompute_progress(p_enrollment_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_course_id UUID;
  v_total INT;
  v_done INT;
  v_rate INT;
  v_status TEXT;
BEGIN
  SELECT course_id INTO v_course_id
    FROM elearning_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment_not_found'; END IF;

  SELECT count(*) INTO v_total
    FROM elearning_chapters WHERE course_id = v_course_id;
  SELECT count(*) INTO v_done
    FROM elearning_chapter_progress
    WHERE enrollment_id = p_enrollment_id AND is_completed = TRUE;

  v_rate := CASE WHEN v_total > 0 THEN round(100.0 * v_done / v_total)::INT ELSE 0 END;
  v_status := CASE
    WHEN v_rate >= 100 THEN 'completed'
    WHEN v_rate > 0 THEN 'in_progress'
    ELSE 'enrolled' END;

  UPDATE elearning_enrollments SET
    completion_rate = v_rate,
    status = v_status,
    started_at = COALESCE(started_at,
      CASE WHEN v_status <> 'enrolled' THEN now() END),
    completed_at = CASE WHEN v_rate >= 100
      THEN COALESCE(completed_at, now()) ELSE NULL END
  WHERE id = p_enrollment_id;
END;
$$;

-- 2b. Bascule de publication atomique + garde avant publication
CREATE OR REPLACE FUNCTION elearning_publish_course(p_course_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_gen TEXT;
  v_chapters INT;
  v_new TEXT;
BEGIN
  SELECT status, generation_status INTO v_status, v_gen
    FROM elearning_courses WHERE id = p_course_id
    FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;

  IF v_status = 'published' THEN
    v_new := 'draft';  -- depublication : toujours permise
  ELSE
    SELECT count(*) INTO v_chapters
      FROM elearning_chapters WHERE course_id = p_course_id;
    IF v_gen IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'generation_incomplete'; END IF;
    IF v_chapters = 0 THEN RAISE EXCEPTION 'no_chapters'; END IF;
    v_new := 'published';
  END IF;

  UPDATE elearning_courses SET status = v_new, updated_at = now()
    WHERE id = p_course_id;
  RETURN v_new;
END;
$$;

-- 2c. Incréments atomiques des compteurs de tentatives.
-- La ligne de progression/score est upsertée par la route AVANT l'appel ;
-- ces RPC font un UPDATE atomique (verrou de ligne) et renvoient le compteur à jour.
CREATE OR REPLACE FUNCTION elearning_bump_chapter_quiz_attempts(
  p_enrollment_id UUID, p_chapter_id UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_attempts INT;
BEGIN
  UPDATE elearning_chapter_progress
    SET quiz_attempts = COALESCE(quiz_attempts, 0) + 1
    WHERE enrollment_id = p_enrollment_id AND chapter_id = p_chapter_id
    RETURNING quiz_attempts INTO v_attempts;
  IF NOT FOUND THEN RAISE EXCEPTION 'chapter_progress_not_found'; END IF;
  RETURN v_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION elearning_bump_final_exam_attempts(p_enrollment_id UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_attempts INT;
BEGIN
  UPDATE elearning_final_exam_progress
    SET attempts = COALESCE(attempts, 0) + 1
    WHERE enrollment_id = p_enrollment_id
    RETURNING attempts INTO v_attempts;
  IF NOT FOUND THEN RAISE EXCEPTION 'final_exam_progress_not_found'; END IF;
  RETURN v_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION elearning_bump_course_score_attempts(
  p_course_id UUID, p_user_id UUID)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_attempts INT;
BEGIN
  UPDATE elearning_course_scores
    SET attempts = COALESCE(attempts, 0) + 1
    WHERE course_id = p_course_id AND user_id = p_user_id
    RETURNING attempts INTO v_attempts;
  IF NOT FOUND THEN RAISE EXCEPTION 'course_score_not_found'; END IF;
  RETURN v_attempts;
END;
$$;
