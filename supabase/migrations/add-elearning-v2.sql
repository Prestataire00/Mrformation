-- ============================================================
-- E-Learning V2: Examen Final, Flashcards Globales, Slides, Live
-- ============================================================

-- 1. Final Exam Question Bank (course-level)
CREATE TABLE IF NOT EXISTS elearning_final_exam_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice'
    CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  options JSONB DEFAULT '[]',
  correct_answer TEXT,
  explanation TEXT,

  difficulty INTEGER DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  topic TEXT,
  objective_ref TEXT,
  estimated_time_sec INTEGER DEFAULT 60,
  citations JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',

  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Global Flashcards (course-level)
CREATE TABLE IF NOT EXISTS elearning_global_flashcards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  citations JSONB DEFAULT '[]',

  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Final Exam Progress (per enrollment)
CREATE TABLE IF NOT EXISTS elearning_final_exam_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES elearning_enrollments(id) ON DELETE CASCADE NOT NULL,

  score INTEGER,
  passed BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  last_answers JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(enrollment_id)
);

-- 4. Slide Specs (course-level)
CREATE TABLE IF NOT EXISTS elearning_slide_specs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  slide_spec JSONB NOT NULL DEFAULT '{}',
  version INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Live Sessions
CREATE TABLE IF NOT EXISTS elearning_live_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,
  presenter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  current_slide_index INTEGER DEFAULT 0,
  current_state JSONB DEFAULT '{}',

  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ============================================================
-- ALTER existing tables
-- ============================================================

-- Add generation parameters to courses
ALTER TABLE elearning_courses
  ADD COLUMN IF NOT EXISTS final_quiz_target_count INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS flashcards_target_count INTEGER DEFAULT 80,
  ADD COLUMN IF NOT EXISTS final_exam_passing_score INTEGER DEFAULT 70;

-- Extend question_type CHECK to include short_answer
ALTER TABLE elearning_quiz_questions
  DROP CONSTRAINT IF EXISTS elearning_quiz_questions_question_type_check;
ALTER TABLE elearning_quiz_questions
  ADD CONSTRAINT elearning_quiz_questions_question_type_check
  CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer'));

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE elearning_final_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_global_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_final_exam_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_slide_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access elearning_final_exam_questions" ON elearning_final_exam_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_global_flashcards" ON elearning_global_flashcards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_final_exam_progress" ON elearning_final_exam_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_slide_specs" ON elearning_slide_specs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_live_sessions" ON elearning_live_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_final_exam_questions_course ON elearning_final_exam_questions(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_final_exam_questions_difficulty ON elearning_final_exam_questions(course_id, difficulty);
CREATE INDEX IF NOT EXISTS idx_final_exam_questions_topic ON elearning_final_exam_questions(course_id, topic);
CREATE INDEX IF NOT EXISTS idx_global_flashcards_course ON elearning_global_flashcards(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_final_exam_progress_enrollment ON elearning_final_exam_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_slide_specs_course ON elearning_slide_specs(course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON elearning_live_sessions(course_id, status);
