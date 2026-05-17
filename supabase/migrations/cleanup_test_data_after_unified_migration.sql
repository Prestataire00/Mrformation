-- ============================================================
-- Migration : Cleanup test data après bascule applicative b-3 à b-7
-- ============================================================
-- Stories B3 à B7 : tous les accès code applicatifs ont été migrés vers
-- la table `documents` unifiée (PR #105). Loris peut maintenant utiliser
-- l'app et toutes les writes vont directement dans `documents`.
--
-- ⚠ Cette migration VIDE les data de test (jetables d'après le contexte
-- utilisateur 2026-05-17). Les schémas des tables sont CONSERVÉS pour
-- rollback éventuel.
--
-- À exécuter en prod APRÈS validation que tout fonctionne (test manuel
-- TabConventionDocs : ajouter apprenant → docs créés → confirmer → envoyer
-- → tout passe par la nouvelle table).
-- ============================================================

-- ── 0. Compteurs AVANT cleanup ──
DO $$
DECLARE
  legacy_total BIGINT;
  unified_total BIGINT;
  unified_backfilled BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_total FROM formation_convention_documents;
  SELECT COUNT(*) INTO unified_total FROM documents;
  SELECT COUNT(*) INTO unified_backfilled FROM documents
    WHERE metadata->>'legacy_table' = 'formation_convention_documents';
  RAISE NOTICE '[cleanup] AVANT : legacy=% rows, documents total=% rows, dont backfilled=% rows',
    legacy_total, unified_total, unified_backfilled;
END $$;

-- ── 1. TRUNCATE des tables (data jetable, schéma conservé) ──
TRUNCATE TABLE formation_convention_documents;
TRUNCATE TABLE documents;

-- ── 2. Vérification ──
DO $$
DECLARE
  legacy_total BIGINT;
  unified_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_total FROM formation_convention_documents;
  SELECT COUNT(*) INTO unified_total FROM documents;
  RAISE NOTICE '[cleanup] APRÈS : legacy=% rows, documents=% rows', legacy_total, unified_total;
  RAISE NOTICE '[cleanup] ✓ Tables vidées. Loris peut re-créer ses données de test, elles iront directement dans `documents`.';
END $$;

-- ── 3. (OPTIONNEL) Drop la table legacy si on est sûr de ne plus en avoir besoin ──
-- À décommenter et exécuter PLUS TARD (après ≥ 7 jours stabilité prod, story Lot E) :
--
-- DROP TABLE formation_convention_documents CASCADE;
--
-- Pour l'instant on garde la table (schéma vide) pour rollback éventuel.
