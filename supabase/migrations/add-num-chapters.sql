-- Add num_chapters column to control how many chapters the AI generates
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS num_chapters INTEGER DEFAULT 5
CHECK (num_chapters >= 2 AND num_chapters <= 8);
