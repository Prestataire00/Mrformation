-- ============================================================
-- E-Learning "Document → Cours Complet" tables
-- ============================================================

-- 1. Courses
CREATE TABLE IF NOT EXISTS elearning_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Source document
  source_file_name TEXT,
  source_file_url TEXT,
  source_file_type TEXT,
  extracted_text TEXT,

  -- Course metadata
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT,
  thumbnail_url TEXT,
  estimated_duration_minutes INTEGER DEFAULT 0,

  -- Workflow
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing','draft','review','published','archived')),
  generation_status TEXT DEFAULT 'pending' CHECK (generation_status IN ('pending','extracting','generating','completed','failed')),
  generation_error TEXT,
  generation_log JSONB DEFAULT '[]',

  language TEXT DEFAULT 'fr',
  difficulty_level TEXT DEFAULT 'intermediate' CHECK (difficulty_level IN ('beginner','intermediate','advanced')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Chapters
CREATE TABLE IF NOT EXISTS elearning_chapters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,

  title TEXT NOT NULL,
  summary TEXT,
  content_html TEXT,
  content_markdown TEXT,
  key_concepts JSONB DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0,
  estimated_duration_minutes INTEGER DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Quizzes (one per chapter)
CREATE TABLE IF NOT EXISTS elearning_quizzes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID REFERENCES elearning_chapters(id) ON DELETE CASCADE NOT NULL,

  title TEXT NOT NULL DEFAULT 'Quiz',
  passing_score INTEGER DEFAULT 70,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Quiz questions
CREATE TABLE IF NOT EXISTS elearning_quiz_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID REFERENCES elearning_quizzes(id) ON DELETE CASCADE NOT NULL,

  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice','true_false')),
  options JSONB NOT NULL DEFAULT '[]',
  explanation TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Flashcards
CREATE TABLE IF NOT EXISTS elearning_flashcards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID REFERENCES elearning_chapters(id) ON DELETE CASCADE NOT NULL,

  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enrollments
CREATE TABLE IF NOT EXISTS elearning_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES elearning_courses(id) ON DELETE CASCADE NOT NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE NOT NULL,

  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_rate INTEGER DEFAULT 0,

  enrolled_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(course_id, learner_id)
);

-- 7. Chapter progress
CREATE TABLE IF NOT EXISTS elearning_chapter_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES elearning_enrollments(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES elearning_chapters(id) ON DELETE CASCADE NOT NULL,

  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER DEFAULT 0,

  quiz_score INTEGER,
  quiz_passed BOOLEAN DEFAULT FALSE,
  quiz_attempts INTEGER DEFAULT 0,
  last_quiz_answers JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(enrollment_id, chapter_id)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE elearning_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE elearning_chapter_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access elearning_courses" ON elearning_courses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_chapters" ON elearning_chapters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_quizzes" ON elearning_quizzes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_quiz_questions" ON elearning_quiz_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_flashcards" ON elearning_flashcards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_enrollments" ON elearning_enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access elearning_chapter_progress" ON elearning_chapter_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_elearning_courses_entity ON elearning_courses(entity_id);
CREATE INDEX IF NOT EXISTS idx_elearning_courses_status ON elearning_courses(status);
CREATE INDEX IF NOT EXISTS idx_elearning_chapters_course ON elearning_chapters(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_elearning_quizzes_chapter ON elearning_quizzes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_elearning_quiz_questions_quiz ON elearning_quiz_questions(quiz_id, order_index);
CREATE INDEX IF NOT EXISTS idx_elearning_flashcards_chapter ON elearning_flashcards(chapter_id, order_index);
CREATE INDEX IF NOT EXISTS idx_elearning_enrollments_learner ON elearning_enrollments(learner_id);
CREATE INDEX IF NOT EXISTS idx_elearning_enrollments_course ON elearning_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_elearning_chapter_progress_enrollment ON elearning_chapter_progress(enrollment_id);

-- ============================================================
-- Storage bucket (run via Supabase dashboard or API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('elearning-documents', 'elearning-documents', false);
-- ============================================================
