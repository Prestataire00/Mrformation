-- ============================================================
-- Migration : ajout colonne birth_city à learners
-- Story B-AIPR (PR #70)
-- ============================================================
-- Utilisée par l'attestation AIPR (Autorisation d'Intervention à Proximité
-- des Réseaux — domaine BTP) qui demande la ville de naissance de
-- l'apprenant. Idempotent (IF NOT EXISTS).
--
-- À jouer manuellement dans Supabase Dashboard > SQL Editor.
-- ============================================================

ALTER TABLE learners ADD COLUMN IF NOT EXISTS birth_city TEXT;

COMMENT ON COLUMN learners.birth_city IS
  'Ville de naissance de l''apprenant — utilisée par l''attestation AIPR (article R. 554-31 du code de l''environnement)';
