-- ============================================================
-- Migration: Sessions Direct Program Link
-- Backfill program_id on sessions from their linked training
-- so sessions can reference programs directly without going
-- through the trainings table.
-- ============================================================

UPDATE sessions s
SET program_id = t.program_id
FROM trainings t
WHERE s.training_id = t.id
  AND s.program_id IS NULL
  AND t.program_id IS NOT NULL;
