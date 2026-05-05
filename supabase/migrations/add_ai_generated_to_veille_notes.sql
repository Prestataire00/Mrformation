-- ============================================================
-- Migration : flag is_ai_generated sur veille_notes
-- ============================================================
-- Bug client : "Analyser avec l'IA" génère une analyse temporaire
-- stockée en localStorage du navigateur — disparait au changement de
-- navigateur, pas partagé entre admins, écrasée à chaque rafraichissement.
--
-- Fix : chaque génération IA crée désormais une note persistante en DB,
-- visible dans la liste de notes au même titre qu'une note manuelle.
-- Le flag is_ai_generated permet de la distinguer (badge UI) et de
-- filtrer si besoin.
-- ============================================================

ALTER TABLE veille_notes
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_veille_notes_ai
  ON veille_notes(entity_id, is_ai_generated, created_at DESC);
