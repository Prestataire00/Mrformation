-- ============================================================
-- Migration : Suppression des champs time_* non utilisés sur formation_elearning_assignments (Story 4.2)
-- ============================================================
-- Les 4 colonnes time_elearning_modules / time_elearning_evaluations /
-- time_other_evaluations / time_virtual_classroom n'ont jamais été populées
-- (aucun INSERT/UPDATE applicatif — audit confirmé). Le temps affiché dans
-- TabElearning est désormais uniquement le temps d'émargement signé, calculé
-- dynamiquement depuis les signatures.
--
-- time_signed_attendance est CONSERVÉE (hors scope de cette migration).
--
-- Idempotente : DROP COLUMN IF EXISTS.
-- Prérequis : le code applicatif ne doit plus lire ces colonnes (cleanup livré
-- dans le même commit que cette migration).
-- ============================================================

ALTER TABLE formation_elearning_assignments DROP COLUMN IF EXISTS time_elearning_modules;
ALTER TABLE formation_elearning_assignments DROP COLUMN IF EXISTS time_elearning_evaluations;
ALTER TABLE formation_elearning_assignments DROP COLUMN IF EXISTS time_other_evaluations;
ALTER TABLE formation_elearning_assignments DROP COLUMN IF EXISTS time_virtual_classroom;

-- ── Diagnostic ──
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
    FROM information_schema.columns
   WHERE table_name = 'formation_elearning_assignments'
     AND column_name IN (
       'time_elearning_modules',
       'time_elearning_evaluations',
       'time_other_evaluations',
       'time_virtual_classroom'
     );
  RAISE NOTICE 'Colonnes time_* restantes (devrait être 0) : %', v_remaining;
END $$;

-- ============================================================
-- Vérification :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'formation_elearning_assignments' ORDER BY ordinal_position;
-- ============================================================
