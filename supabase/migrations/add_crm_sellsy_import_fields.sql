-- ============================================================
-- Migration : Enrichissement CRM pour import Sellsy
-- ============================================================
-- Prépare les tables CRM à recevoir les ~8700 lignes exportées depuis Sellsy
-- (4480 prospects, 2307 commentaires, 1924 tâches MR).
--
-- Ajouts :
--   1. `crm_prospects` : sellsy_id + adresse + naf_code (pour idempotence et
--      pour stocker les colonnes du CSV sans concaténer dans `notes`).
--   2. `crm_tasks` : sellsy_external_ref (hash, le CSV tâches n'a pas d'ID
--      propre) + label (le LABEL Sellsy : "Relance par téléphone/mail", etc.).
--   3. Nouvelle table `crm_prospect_comments` (2307 commentaires datés liés
--      aux prospects via le sellsy_id du prospect).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- contraintes UNIQUE protégées par un DO bloc qui vérifie pg_constraint.
--
-- À exécuter dans Supabase SQL Editor (Cmd+A + Run).
-- ============================================================

-- ── 1. crm_prospects : nouvelles colonnes ──
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS sellsy_id TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE crm_prospects ADD COLUMN IF NOT EXISTS naf_code TEXT;

-- Index pour les lookups par sellsy_id (utilisé par l'import et pour relier
-- les commentaires/tâches au bon prospect).
CREATE INDEX IF NOT EXISTS idx_crm_prospects_sellsy_id
  ON crm_prospects(sellsy_id)
  WHERE sellsy_id IS NOT NULL;

-- Contrainte UNIQUE (sellsy_id, entity_id) — protège contre les doublons en cas
-- de relance de l'import. Idempotente via vérification pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_prospects_sellsy_id_entity_unique'
  ) THEN
    ALTER TABLE crm_prospects
      ADD CONSTRAINT crm_prospects_sellsy_id_entity_unique
      UNIQUE (sellsy_id, entity_id);
  END IF;
END $$;

-- ── 2. crm_tasks : nouvelles colonnes ──
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS sellsy_external_ref TEXT;
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS label TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_sellsy_ref
  ON crm_tasks(sellsy_external_ref)
  WHERE sellsy_external_ref IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_tasks_sellsy_ref_entity_unique'
  ) THEN
    ALTER TABLE crm_tasks
      ADD CONSTRAINT crm_tasks_sellsy_ref_entity_unique
      UNIQUE (sellsy_external_ref, entity_id);
  END IF;
END $$;

-- ── 3. crm_prospect_comments : nouvelle table ──
CREATE TABLE IF NOT EXISTS crm_prospect_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- prospect_id nullable : pendant l'import Sellsy, un commentaire peut référencer
  -- un prospect via son `sellsy_id` qui n'existe plus en base (filtré, supprimé
  -- avant l'import). Plutôt que de faire échouer toute la transaction, on
  -- insère NULL et on nettoie ensuite via `DELETE ... WHERE prospect_id IS NULL`.
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  author_name TEXT,
  author_email TEXT,
  comment_date DATE,
  text TEXT NOT NULL,
  sellsy_id TEXT,
  parent_sellsy_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_prospect_comments_prospect
  ON crm_prospect_comments(prospect_id);
CREATE INDEX IF NOT EXISTS idx_crm_prospect_comments_entity
  ON crm_prospect_comments(entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_prospect_comments_sellsy_id
  ON crm_prospect_comments(sellsy_id)
  WHERE sellsy_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_prospect_comments_sellsy_id_entity_unique'
  ) THEN
    ALTER TABLE crm_prospect_comments
      ADD CONSTRAINT crm_prospect_comments_sellsy_id_entity_unique
      UNIQUE (sellsy_id, entity_id);
  END IF;
END $$;

-- ── 4. RLS sur la nouvelle table ──
ALTER TABLE crm_prospect_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_isolation" ON crm_prospect_comments;
CREATE POLICY "entity_isolation" ON crm_prospect_comments
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- ── 5. Diagnostic (SELECT plain — pas de DO $$ pour éviter le piège de
--     l'exécution partielle dans Supabase SQL Editor) ──
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'crm_prospects' AND column_name = 'sellsy_id') AS prospects_sellsy_id_present,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'crm_tasks' AND column_name = 'sellsy_external_ref') AS tasks_sellsy_ref_present,
  (SELECT to_regclass('public.crm_prospect_comments')) AS table_comments_existe,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname LIKE 'crm_%_sellsy_%_entity_unique') AS unique_constraints_present;

-- ============================================================
-- Vérifications post-migration :
--   1. SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'crm_prospects' ORDER BY ordinal_position;
--   2. SELECT COUNT(*) FROM crm_prospect_comments;
-- ============================================================
