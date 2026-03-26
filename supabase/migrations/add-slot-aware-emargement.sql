-- ============================================================
-- Migration: Slot-Aware QR Code Emargement System
-- Rend les signing_tokens compatibles avec les créneaux (demi-journées)
-- pour générer un QR code unique par personne par créneau
-- ============================================================

-- 1. Ajouter time_slot_id sur signing_tokens
ALTER TABLE signing_tokens
  ADD COLUMN IF NOT EXISTS time_slot_id UUID REFERENCES formation_time_slots(id) ON DELETE CASCADE;

-- 2. Support tokens formateur (signer_type + trainer_id)
ALTER TABLE signing_tokens
  ADD COLUMN IF NOT EXISTS signer_type TEXT DEFAULT 'learner'
    CHECK (signer_type IN ('learner', 'trainer'));

ALTER TABLE signing_tokens
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE;

-- 3. Index pour performance
CREATE INDEX IF NOT EXISTS idx_signing_tokens_time_slot ON signing_tokens(time_slot_id);
CREATE INDEX IF NOT EXISTS idx_signing_tokens_trainer ON signing_tokens(trainer_id);

-- 4. Contrainte unique sur signatures incluant time_slot_id
-- Partial unique index pour les nouvelles signatures (avec slot)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_sig_slot
  ON signatures (session_id, signer_id, signer_type, time_slot_id)
  WHERE time_slot_id IS NOT NULL;
