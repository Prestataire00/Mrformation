-- ============================================================
-- Script: Nettoyage des doublons signing_tokens
-- Date: 2026-04-22
-- ============================================================
-- À EXÉCUTER AVANT la migration fix_signing_tokens_duplicates.sql
--
-- RÈGLE DE PRIORITÉ :
-- 1. Garder le token utilisé (used_at IS NOT NULL) en priorité
-- 2. Sinon, garder le plus ancien (created_at ASC)
-- 3. Supprimer les autres
-- ============================================================

-- DRY RUN : combien de doublons seraient supprimés ?
WITH ranked_tokens AS (
  SELECT
    id,
    session_id,
    time_slot_id,
    COALESCE(learner_id, trainer_id) AS signer_id,
    signer_type,
    used_at,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, time_slot_id, COALESCE(learner_id, trainer_id), signer_type
      ORDER BY
        used_at ASC NULLS LAST,
        created_at ASC
    ) AS rn
  FROM signing_tokens
  WHERE time_slot_id IS NOT NULL
    AND (learner_id IS NOT NULL OR trainer_id IS NOT NULL)
)
SELECT
  COUNT(*) AS nb_a_supprimer,
  COUNT(*) FILTER (WHERE used_at IS NOT NULL) AS nb_utilises_erreur
FROM ranked_tokens
WHERE rn > 1;

-- NETTOYAGE RÉEL (décommenter après validation du dry run)
-- WITH ranked_tokens AS (
--   SELECT
--     id,
--     ROW_NUMBER() OVER (
--       PARTITION BY session_id, time_slot_id, COALESCE(learner_id, trainer_id), signer_type
--       ORDER BY
--         used_at ASC NULLS LAST,
--         created_at ASC
--     ) AS rn
--   FROM signing_tokens
--   WHERE time_slot_id IS NOT NULL
--     AND (learner_id IS NOT NULL OR trainer_id IS NOT NULL)
-- )
-- DELETE FROM signing_tokens
-- WHERE id IN (SELECT id FROM ranked_tokens WHERE rn > 1);
