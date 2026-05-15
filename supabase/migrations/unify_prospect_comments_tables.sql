-- ============================================================
-- Migration : Unification des tables prospect_comments et crm_prospect_comments
-- ============================================================
-- Avant : deux tables coexistaient :
--   - `prospect_comments` (créée par add-prospect-list-view.sql) — usage UI
--     in-app, schema = (id, prospect_id, author_id FK auth.users, content,
--     created_at, updated_at). Pas d'entity_id, RLS `USING (true)` (bug).
--   - `crm_prospect_comments` (créée par add_crm_sellsy_import_fields.sql) —
--     usage import Sellsy, schema = (id, prospect_id, entity_id, author_name,
--     author_email, comment_date, text, sellsy_id, parent_sellsy_id, created_at).
--     RLS correcte mais pas de FK profile.
--
-- L'UI lit `prospect_comments` mais les 2307 commentaires Sellsy sont dans
-- `crm_prospect_comments` → invisibles.
--
-- Fix : on enrichit `crm_prospect_comments` avec `author_id` pour supporter
-- les commentaires in-app, on migre les éventuelles lignes de
-- `prospect_comments` vers `crm_prospect_comments`, on drop l'ancienne table.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS, INSERT WHERE NOT EXISTS, DROP TABLE
-- IF EXISTS).
-- ============================================================

BEGIN;

-- ── 1. Ajout colonne author_id sur crm_prospect_comments ──
-- FK vers profiles plutôt que auth.users : permet la jointure native Supabase
-- (Supabase auto-détecte le FK pour `profiles:author_id (first_name, last_name)`).
-- profile.id = auth.user.id (même UUID) donc équivalent fonctionnellement.
ALTER TABLE crm_prospect_comments
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_prospect_comments_author
  ON crm_prospect_comments(author_id) WHERE author_id IS NOT NULL;

-- ── 2. Migration des données de prospect_comments → crm_prospect_comments ──
-- On copie chaque commentaire in-app dans la nouvelle table en récupérant
-- l'entity_id depuis le prospect lié. Idempotent : on évite les doublons par
-- la combinaison (prospect_id, author_id, text, created_at) ≈ unique.
INSERT INTO crm_prospect_comments
  (prospect_id, entity_id, author_id, text, created_at)
SELECT
  pc.prospect_id,
  p.entity_id,
  pc.author_id,
  pc.content,
  pc.created_at
FROM prospect_comments pc
JOIN crm_prospects p ON p.id = pc.prospect_id
WHERE NOT EXISTS (
  SELECT 1 FROM crm_prospect_comments cpc
  WHERE cpc.prospect_id = pc.prospect_id
    AND cpc.author_id = pc.author_id
    AND cpc.text = pc.content
    AND cpc.created_at = pc.created_at
);

-- ── 3. Drop de la vieille table (après migration) ──
-- Note : si prospect_comments avait une RLS `USING (true)` foireuse, on s'en
-- débarrasse au passage. La policy sur crm_prospect_comments est entity_isolation.
DROP TABLE IF EXISTS prospect_comments CASCADE;

COMMIT;

-- ── 4. Vérification (hors transaction) ──
SELECT
  (SELECT to_regclass('public.prospect_comments')) AS prospect_comments_doit_etre_NULL,
  (SELECT COUNT(*) FROM crm_prospect_comments) AS total_comments,
  (SELECT COUNT(*) FROM crm_prospect_comments WHERE author_id IS NOT NULL) AS comments_in_app,
  (SELECT COUNT(*) FROM crm_prospect_comments WHERE sellsy_id IS NOT NULL) AS comments_sellsy;
