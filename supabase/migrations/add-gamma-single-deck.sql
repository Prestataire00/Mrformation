-- Single Gamma deck strategy: store embed URL at course level + slide offset per chapter

-- Course-level Gamma fields (single deck for entire course)
ALTER TABLE elearning_courses
ADD COLUMN IF NOT EXISTS gamma_embed_url TEXT,
ADD COLUMN IF NOT EXISTS gamma_deck_url TEXT,
ADD COLUMN IF NOT EXISTS gamma_deck_id TEXT;

-- Chapter-level slide start index (which card/slide begins this chapter)
ALTER TABLE elearning_chapters
ADD COLUMN IF NOT EXISTS gamma_slide_start INTEGER DEFAULT 0;
