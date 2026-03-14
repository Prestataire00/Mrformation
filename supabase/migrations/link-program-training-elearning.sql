-- Link programs to trainings and elearning_courses
-- This allows a program (bibliothèque) to be the source for a formation or an e-learning course

ALTER TABLE trainings ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;
ALTER TABLE elearning_courses ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trainings_program_id ON trainings(program_id);
CREATE INDEX IF NOT EXISTS idx_elearning_courses_program_id ON elearning_courses(program_id);
