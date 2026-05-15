-- ============================================================
-- Migration : Soft-delete renforcé sur learners (Story 5.4 — FR20)
-- ============================================================
-- Permet de "supprimer" un apprenant sans détruire l'historique pédagogique
-- (Qualiopi exige une rétention de 10 ans des dossiers de formation).
--
-- Règle métier :
--  - Un apprenant SANS enrollment sur une session `completed` peut être
--    hard-supprimé librement.
--  - Un apprenant lié à AU MOINS UNE session `completed` ne peut PLUS être
--    hard-supprimé : il doit être archivé (soft-delete via `deleted_at`).
--
-- Cette migration ajoute :
--  1. La colonne `deleted_at` (timestamp d'archivage applicatif).
--  2. Un index partiel pour requêter rapidement les apprenants actifs.
--  3. Un trigger BEFORE DELETE qui bloque le hard-delete si historique présent,
--     en défense en profondeur (la couche service `deleteLearner` bloque déjà).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION
-- + DROP TRIGGER IF EXISTS / CREATE TRIGGER.
-- ============================================================

-- ── 1. Colonne deleted_at ──
ALTER TABLE learners ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- ── 2. Index partiel sur apprenants actifs ──
-- Optimise le SELECT habituel `WHERE entity_id = ? AND deleted_at IS NULL`.
CREATE INDEX IF NOT EXISTS idx_learners_active
  ON learners(entity_id)
  WHERE deleted_at IS NULL;

-- ── 3. Fonction trigger : bloque le hard-delete si session 'completed' liée ──
CREATE OR REPLACE FUNCTION prevent_hard_delete_session_linked_learner()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM enrollments e
      JOIN sessions s ON s.id = e.session_id
     WHERE e.learner_id = OLD.id
       AND s.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Apprenant lié à une session terminée — utilisez le soft-delete (deleted_at)'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── 4. Trigger BEFORE DELETE ──
DROP TRIGGER IF EXISTS trg_prevent_hard_delete_session_linked_learner ON learners;
CREATE TRIGGER trg_prevent_hard_delete_session_linked_learner
  BEFORE DELETE ON learners
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete_session_linked_learner();

-- ── 5. Diagnostic ──
DO $$
DECLARE
  v_total INTEGER;
  v_archived INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM learners;
  SELECT COUNT(*) INTO v_archived FROM learners WHERE deleted_at IS NOT NULL;

  RAISE NOTICE 'Learners total : %', v_total;
  RAISE NOTICE 'Learners archivés (deleted_at NOT NULL) : %', v_archived;
END $$;

-- ============================================================
-- Vérification :
--   SELECT id, first_name, last_name, deleted_at FROM learners
--    WHERE deleted_at IS NOT NULL LIMIT 5;
--
-- Test du trigger (doit lever une exception si apprenant lié à 'completed') :
--   DELETE FROM learners WHERE id = '<learner_id_avec_session_completed>';
-- ============================================================
