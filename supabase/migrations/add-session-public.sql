-- Add is_public column to sessions table for learner self-enrollment
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
