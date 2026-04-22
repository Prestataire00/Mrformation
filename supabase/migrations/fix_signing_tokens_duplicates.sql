-- ============================================================
-- Migration: Fix signing_tokens duplicates (bug critique émargement)
-- Date: 2026-04-22
-- ============================================================
-- PRÉREQUIS: exécuter scripts/cleanup_signing_tokens_duplicates.sql
-- AVANT cette migration pour supprimer les doublons existants.
-- ============================================================

-- Pre-flight: vérifier qu'il n'y a plus de doublons
DO $$
DECLARE
  learner_dupes INT;
  trainer_dupes INT;
BEGIN
  SELECT COUNT(*) INTO learner_dupes FROM (
    SELECT 1 FROM signing_tokens
    WHERE signer_type = 'learner' AND used_at IS NULL
      AND learner_id IS NOT NULL AND time_slot_id IS NOT NULL
    GROUP BY session_id, time_slot_id, learner_id
    HAVING COUNT(*) > 1
  ) t;

  SELECT COUNT(*) INTO trainer_dupes FROM (
    SELECT 1 FROM signing_tokens
    WHERE signer_type = 'trainer' AND used_at IS NULL
      AND trainer_id IS NOT NULL AND time_slot_id IS NOT NULL
    GROUP BY session_id, time_slot_id, trainer_id
    HAVING COUNT(*) > 1
  ) t;

  IF learner_dupes > 0 OR trainer_dupes > 0 THEN
    RAISE EXCEPTION
      'Doublons détectés: % apprenants, % formateurs. Nettoyer avec cleanup_signing_tokens_duplicates.sql',
      learner_dupes, trainer_dupes;
  END IF;
END $$;

-- Index unique pour tokens apprenants actifs (non utilisés)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_learner_slot_token
  ON signing_tokens (session_id, time_slot_id, learner_id)
  WHERE signer_type = 'learner'
    AND used_at IS NULL
    AND learner_id IS NOT NULL
    AND time_slot_id IS NOT NULL;

-- Index unique pour tokens formateurs actifs (non utilisés)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_trainer_slot_token
  ON signing_tokens (session_id, time_slot_id, trainer_id)
  WHERE signer_type = 'trainer'
    AND used_at IS NULL
    AND trainer_id IS NOT NULL
    AND time_slot_id IS NOT NULL;
