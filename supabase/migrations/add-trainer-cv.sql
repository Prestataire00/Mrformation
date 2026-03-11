-- Add CV columns to trainers table
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS cv_url TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS cv_text TEXT;
