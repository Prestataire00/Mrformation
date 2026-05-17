-- ============================================================
-- Migration : DROP TABLE legacy formation_convention_documents
-- ============================================================
-- Cette table est ZOMBIE depuis PR #105 (b-3..b-7 bascule applicative) :
-- aucun code applicatif ne lit/écrit dedans, tout passe maintenant par
-- la table unifiée `documents`.
--
-- Confirmation côté code (audit PR #109) :
--   grep -rn 'from(.formation_convention_documents.)' src/
--   → 0 résultats (toutes occurrences sont des PROP NAMES ou commentaires)
--
-- Schéma conservé pendant 1 jour (PR #105 → #109) pour rollback éventuel.
-- Maintenant que tout fonctionne, on peut DROP définitivement.
--
-- ROLLBACK : si problème, restaurer depuis le fichier
-- `supabase/migrations/add-convention-tab.sql` qui contient le CREATE TABLE
-- original. Mais aucune data ne sera restaurée (table était vide post-cleanup).
-- ============================================================

-- ── 0. Pré-flight : confirmer que la table est vide ──
DO $$
DECLARE
  row_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM formation_convention_documents;
  RAISE NOTICE '[drop-legacy] AVANT : formation_convention_documents = % rows', row_count;
  IF row_count > 0 THEN
    RAISE EXCEPTION '[drop-legacy] STOP : table contient % rows, refuse de drop. Run cleanup_test_data SQL d''abord ou DELETE manuellement.', row_count;
  END IF;
END $$;

-- ── 1. DROP TABLE CASCADE ──
-- CASCADE drop aussi les FKs qui pointent vers cette table.
-- (FK signing_tokens.document_id et document_signatures.document_id ont déjà
-- été re-pointées vers documents() dans cleanup_test_data_after_unified_migration.sql,
-- donc rien ne devrait être impacté.)
DROP TABLE IF EXISTS formation_convention_documents CASCADE;

-- ── 2. Vérification ──
DO $$
DECLARE
  exists_check BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'formation_convention_documents'
  ) INTO exists_check;
  IF exists_check THEN
    RAISE EXCEPTION '[drop-legacy] ERREUR : table existe encore après DROP';
  END IF;
  RAISE NOTICE '[drop-legacy] ✓ Table formation_convention_documents droppée. Plus aucun doublon avec documents.';
END $$;
