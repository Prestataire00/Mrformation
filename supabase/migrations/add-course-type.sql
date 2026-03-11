-- Add course_type to control what gets generated
-- "presentation" = Gamma only, "quiz" = Quiz + Flashcards only, "complete" = everything
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS course_type TEXT NOT NULL DEFAULT 'complete'
CHECK (course_type IN ('presentation', 'quiz', 'complete'));

-- Gamma theme and template support
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS gamma_theme_id TEXT,
ADD COLUMN IF NOT EXISTS gamma_template_id TEXT;
