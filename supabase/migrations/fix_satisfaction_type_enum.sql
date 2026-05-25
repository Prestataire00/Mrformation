-- ============================================================================
-- Migration : Aligner CHECK constraint formation_satisfaction_assignments.
-- satisfaction_type avec les valeurs proposées par l'UI TabQuestionnaires.
--
-- Résout P0-3 du deep-dive 2026-05-25 :
-- UI propose 'satisfaction_entreprise' mais la CHECK constraint DB le rejette,
-- causant un crash silencieux à l'attribution.
--
-- Investigation Task 0 a confirmé l'écart :
-- - UI propose : satisfaction_chaud, satisfaction_froid, satisfaction_entreprise
-- - DB accepte : satisfaction_chaud, satisfaction_froid, quest_financeurs,
--   quest_formateurs, quest_managers, quest_entreprises, autres_quest
-- → 'satisfaction_entreprise' manque côté DB.
--
-- Source : docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md §6.1
-- ============================================================================

-- DROP de l'ancienne CHECK constraint (nom auto-généré par PostgreSQL).
-- Compat noms candidats : on inclut les variantes possibles.
ALTER TABLE formation_satisfaction_assignments
  DROP CONSTRAINT IF EXISTS formation_satisfaction_assignments_satisfaction_type_check;
ALTER TABLE formation_satisfaction_assignments
  DROP CONSTRAINT IF EXISTS satisfaction_type_check;

-- ADD nouvelle CHECK avec la liste exhaustive UI + DB existant.
-- ⚠ Préserver les 5 valeurs DB existantes (quest_*, autres_quest) — il est
-- possible qu'elles soient consommées par /admin/questionnaires/* ou par
-- des données legacy. Ne jamais supprimer une valeur sans audit dédié.
ALTER TABLE formation_satisfaction_assignments
  ADD CONSTRAINT formation_satisfaction_assignments_satisfaction_type_check
  CHECK (satisfaction_type IN (
    -- Valeurs UI TabQuestionnaires
    'satisfaction_chaud',
    'satisfaction_froid',
    'satisfaction_entreprise',  -- ← AJOUT P0-3
    -- Valeurs DB existantes (préservées)
    'quest_financeurs',
    'quest_formateurs',
    'quest_managers',
    'quest_entreprises',
    'autres_quest'
  ));
