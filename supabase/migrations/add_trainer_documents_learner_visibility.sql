-- ============================================================
-- Migration: visibilité apprenant des documents de session formateur
-- Les `trainer_documents` (scope='session') sont rattachés à une session mais
-- n'avaient aucun chemin de lecture apprenant. On ajoute un flag + une RLS de
-- lecture pour les apprenants inscrits à la session.
-- ⚠️ Politique sans helper de rôle (elle vaut pour tout authentifié inscrit) —
--    cohérent quel que soit le schéma des helpers (public.* vs auth.*).
-- ============================================================

-- 1. Flag de visibilité (visible par défaut → friction minimale à l'upload)
ALTER TABLE trainer_documents
  ADD COLUMN IF NOT EXISTS visible_to_learners BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_trainer_docs_visible
  ON trainer_documents(session_id, visible_to_learners) WHERE scope = 'session';

-- 2. Backfill prudent : ne pas exposer rétroactivement les docs sensibles déjà
--    uploadés (émargements, évaluations, bilans). Le formateur pourra les
--    repartager au cas par cas via le toggle.
UPDATE trainer_documents
  SET visible_to_learners = false
  WHERE scope = 'session'
    AND doc_type IN ('feuille_emargement', 'evaluation', 'bilan_pedagogique');

-- 3. RLS : l'apprenant lit les documents de session VISIBLES des sessions où il
--    est inscrit. (La section apprenant lit la table via le client browser.)
DROP POLICY IF EXISTS "trainer_documents_learner_read" ON trainer_documents;
CREATE POLICY "trainer_documents_learner_read" ON trainer_documents
  FOR SELECT TO authenticated
  USING (
    scope = 'session'
    AND visible_to_learners = true
    AND session_id IN (
      SELECT session_id FROM enrollments
      WHERE learner_id IN (SELECT id FROM learners WHERE profile_id = auth.uid())
    )
  );

-- Vérif : SELECT column_name FROM information_schema.columns
--   WHERE table_name='trainer_documents' AND column_name='visible_to_learners';  -- 1 ligne
