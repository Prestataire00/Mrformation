-- ============================================================
-- Migration: Onglet 8 (Programme) — champ DPC sur sessions
-- ============================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_dpc BOOLEAN DEFAULT FALSE;
