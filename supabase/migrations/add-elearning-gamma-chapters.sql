-- Add per-chapter Gamma presentation fields
ALTER TABLE elearning_chapters
  ADD COLUMN IF NOT EXISTS gamma_deck_id TEXT,
  ADD COLUMN IF NOT EXISTS gamma_deck_url TEXT,
  ADD COLUMN IF NOT EXISTS gamma_embed_url TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pdf TEXT,
  ADD COLUMN IF NOT EXISTS gamma_export_pptx TEXT,
  ADD COLUMN IF NOT EXISTS gamma_prompt_content TEXT,
  ADD COLUMN IF NOT EXISTS is_enriched BOOLEAN DEFAULT FALSE;

-- Add enrichment tracking to courses
ALTER TABLE elearning_courses
  ADD COLUMN IF NOT EXISTS gamma_prompt_content TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_model TEXT DEFAULT 'gpt-4o';
