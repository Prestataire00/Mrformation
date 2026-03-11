-- Add Gamma presentation columns to elearning_courses
ALTER TABLE elearning_courses
  ADD COLUMN IF NOT EXISTS gamma_deck_id TEXT,
  ADD COLUMN IF NOT EXISTS gamma_deck_url TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pdf TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pptx TEXT;
