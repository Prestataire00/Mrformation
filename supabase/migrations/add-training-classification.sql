-- Add classification column to trainings table
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS classification TEXT;
