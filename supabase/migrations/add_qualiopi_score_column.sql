-- ============================================================
-- Migration : Score Qualiopi pré-calculé sur sessions
-- ============================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qualiopi_score INTEGER DEFAULT 0;
