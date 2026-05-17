-- ============================================================
-- Fix bug signature émargement : RLS super_admin + safety nets
-- ============================================================
-- Référence : docs/superpowers/specs/2026-05-17-emargement-signature-bug-fix-design.md
-- À exécuter manuellement dans Supabase Dashboard SQL Editor.
-- Idempotent : DROP/CREATE + IF NOT EXISTS.

BEGIN;

-- 1. Drop la vieille contrainte UNIQUE (déjà absente en prod, no-op safe)
ALTER TABLE signatures DROP CONSTRAINT IF EXISTS unique_session_signer;

-- 2. Safety net : colonnes attendues par la route POST /api/emargement/sign
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS time_slot_id UUID REFERENCES formation_time_slots(id) ON DELETE SET NULL;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signature_method TEXT DEFAULT 'handwritten';

-- 3. Garantir le partial unique index slot-aware (1 signature par slot+signer)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_sig_slot
  ON signatures (session_id, signer_id, signer_type, time_slot_id)
  WHERE time_slot_id IS NOT NULL;

-- 4. RLS signatures admin : autoriser super_admin (la fonction user_role()
--    est en schéma public, pas auth)
DROP POLICY IF EXISTS "signatures_admin_all" ON signatures;
CREATE POLICY "signatures_admin_all" ON signatures
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND (session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id()) OR session_id IS NULL)
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND (session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id()) OR session_id IS NULL)
  );

-- 5. RLS trainer INSERT : signer_id = trainer.id (lookup via profile_id), pas auth.uid()
DROP POLICY IF EXISTS "signatures_trainer_insert" ON signatures;
CREATE POLICY "signatures_trainer_insert" ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    user_role() = 'trainer'
    AND signer_type = 'trainer'
    AND signer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
  );

-- 6. RLS trainer SELECT : même correction (lookup trainer via profile_id)
DROP POLICY IF EXISTS "signatures_trainer_read" ON signatures;
CREATE POLICY "signatures_trainer_read" ON signatures
  FOR SELECT TO authenticated
  USING (
    user_role() = 'trainer'
    AND (
      signer_id IN (SELECT id FROM trainers WHERE profile_id = auth.uid())
      OR session_id IN (
        SELECT s.id FROM sessions s
        JOIN trainers t ON t.id = s.trainer_id
        WHERE t.profile_id = auth.uid() AND s.entity_id = user_entity_id()
      )
    )
  );

-- 7. signing_tokens : même problème super_admin probable
DROP POLICY IF EXISTS "signing_tokens_admin_all" ON signing_tokens;
CREATE POLICY "signing_tokens_admin_all" ON signing_tokens
  FOR ALL TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
    AND entity_id = user_entity_id()
  );

-- Note : signatures_learner_* policies inchangées (signer_id = auth.uid() reste correct côté learner).

COMMIT;
