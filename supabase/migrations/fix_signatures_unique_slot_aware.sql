-- Migration : Fix contrainte UNIQUE signatures (slot-aware)
-- Date : 2026-04-22
-- Symptôme : "Vous avez déjà signé pour ce créneau" à tort
-- Cause : Ancienne contrainte UNIQUE obsolète, pré-slot-aware

ALTER TABLE signatures DROP CONSTRAINT IF EXISTS unique_session_signer;

CREATE UNIQUE INDEX IF NOT EXISTS unique_sig_with_slot
ON signatures (session_id, signer_id, signer_type, time_slot_id)
WHERE time_slot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_sig_without_slot
ON signatures (session_id, signer_id, signer_type)
WHERE time_slot_id IS NULL;

COMMENT ON INDEX unique_sig_with_slot IS
'Une signature unique par (session, signer, slot).';
COMMENT ON INDEX unique_sig_without_slot IS
'Legacy : une signature unique par (session, signer) pour tokens sans slot.';
