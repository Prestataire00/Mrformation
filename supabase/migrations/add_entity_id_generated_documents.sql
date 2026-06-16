-- ============================================================
-- RGPD Lot A — entity_id sur generated_documents
-- ============================================================
-- Idempotent. À exécuter dans Supabase Dashboard → SQL Editor.
-- Helpers RLS en public.* (PAS auth.*) — convention migrations du projet.
-- ============================================================

-- 1. Colonne (peut déjà exister : le code l'insère déjà)
ALTER TABLE generated_documents
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE CASCADE;

-- 2. Backfill des lignes sans entity_id, depuis session / client / learner (1er non-null)
UPDATE generated_documents gd
SET entity_id = COALESCE(
  (SELECT s.entity_id FROM sessions s WHERE s.id = gd.session_id),
  (SELECT c.entity_id FROM clients c  WHERE c.id = gd.client_id),
  (SELECT l.entity_id FROM learners l WHERE l.id = gd.learner_id)
)
WHERE gd.entity_id IS NULL;

-- 3. Index pour le filtrage
CREATE INDEX IF NOT EXISTS idx_generated_documents_entity ON generated_documents(entity_id);

-- 4. RLS : isolation directe par entity_id (admin de l'entité + super_admin)
DROP POLICY IF EXISTS "generated_documents_entity_isolation" ON generated_documents;
CREATE POLICY "generated_documents_entity_isolation" ON generated_documents
  FOR ALL TO authenticated
  USING (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin')
  WITH CHECK (entity_id = public.user_entity_id() OR public.user_role() = 'super_admin');

-- ============================================================
-- Vérifications (à lancer après) :
--   SELECT count(*) FROM generated_documents WHERE entity_id IS NULL;
--     -- tend vers 0 (sauf orphelins sans session/client/learner)
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='generated_documents' AND column_name='entity_id'; -- 1 ligne
-- ============================================================
