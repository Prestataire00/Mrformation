-- ============================================================
-- Fix RLS prod — un formateur ne pouvait pas MODIFIER sa propre fiche.
--
-- Page « Mon Profil » de l'espace /trainer : l'UPDATE sur `trainers` était
-- bloqué (0 ligne modifiée, échec silencieux). La table `trainers` a des
-- policies strictes (pas d'allow_all) basées sur des helpers `auth.*` qui
-- renvoient NULL en prod → aucune policy UPDATE ne s'applique au formateur.
-- Vérifié empiriquement (formateur de test : UPDATE de sa fiche => 0 ligne).
--
-- Contexte du diagnostic complet de l'espace formateur (2026-06-19) :
--   - Réellement bloquées (policies strictes cassées) : trainers (SELECT) →
--     fix_trainers_trainer_read_own.sql ; formation_trainers + sessions
--     (+ trainings/enrollments/trainer_competencies) → fix_trainer_space_read_rls.sql ;
--     trainers (UPDATE) → CE fichier.
--   - Déjà lisibles via allow_all en prod (aucun fix requis) : formation_time_slots,
--     signatures, generated_documents, questionnaires, questions,
--     questionnaire_responses (SELECT + INSERT). formation_satisfaction_assignments
--     est vide (0 ligne) → sans impact.
--   ⚠️ Si l'allow_all prod est un jour retiré pour durcir la sécurité, il faudra
--      ajouter des policies formateur scopées sur ces tables (mêmes patterns que
--      fix_trainer_space_read_rls.sql).
--
-- À exécuter dans le SQL Editor du Dashboard Supabase (prod).
-- ============================================================

DROP POLICY IF EXISTS "trainers_trainer_update_own" ON trainers;
CREATE POLICY "trainers_trainer_update_own" ON trainers
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
