-- ============================================================
-- Migration : Cleanup test data + Re-pointer FKs après bascule b-3..b-7
-- ============================================================
-- Stories B3 à B7 : tous les accès code applicatifs ont été migrés vers
-- la table `documents` unifiée (PR #105). Loris peut maintenant utiliser
-- l'app et toutes les writes vont directement dans `documents`.
--
-- Cette migration fait 2 choses :
--   1. Vide les data de test (jetables d'après contexte utilisateur 2026-05-17)
--   2. Re-pointe les FK signing_tokens.document_id + document_signatures.document_id
--      depuis `formation_convention_documents` (legacy) vers `documents` (unifiée),
--      car le nouveau code applicatif crée des tokens/signatures liés à
--      documents.id désormais.
--
-- Les schémas des tables sont CONSERVÉS (pas de DROP), juste les data + FK.
-- ============================================================

-- ── 0. Compteurs AVANT cleanup ──
DO $$
DECLARE
  legacy_total BIGINT;
  unified_total BIGINT;
  tokens_with_doc BIGINT;
  tokens_emargement BIGINT;
  sigs_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_total FROM formation_convention_documents;
  SELECT COUNT(*) INTO unified_total FROM documents;
  SELECT COUNT(*) INTO tokens_with_doc FROM signing_tokens WHERE document_id IS NOT NULL;
  SELECT COUNT(*) INTO tokens_emargement FROM signing_tokens
    WHERE token_purpose = 'emargement' OR document_id IS NULL;
  SELECT COUNT(*) INTO sigs_total FROM document_signatures;
  RAISE NOTICE '[cleanup] AVANT : legacy=%, documents=%, signing_tokens(doc=N+)=%, signing_tokens(émargement)=%, document_signatures=%',
    legacy_total, unified_total, tokens_with_doc, tokens_emargement, sigs_total;
END $$;

-- ── 1. Drop FKs existantes (pointent vers formation_convention_documents) ──
ALTER TABLE signing_tokens DROP CONSTRAINT IF EXISTS signing_tokens_document_id_fkey;
ALTER TABLE document_signatures DROP CONSTRAINT IF EXISTS document_signatures_document_id_fkey;

-- ── 2. Vider les data legacy + backfilled (test data jetable) ──
-- DELETE plutôt que TRUNCATE pour :
--   - Préserver les signing_tokens d'émargement (token_purpose='emargement',
--     document_id NULL) qui sont un flux distinct (cf c-2 résolution).
--   - Permettre des conditions WHERE précises si besoin (rollback ciblé).
DELETE FROM document_signatures;
DELETE FROM signing_tokens WHERE document_id IS NOT NULL OR token_purpose = 'document_signature';
DELETE FROM formation_convention_documents;
DELETE FROM documents;

-- ── 3. Re-créer les FKs en pointant vers la nouvelle table `documents` ──
ALTER TABLE signing_tokens
  ADD CONSTRAINT signing_tokens_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE document_signatures
  ADD CONSTRAINT document_signatures_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

-- ── 4. Vérification ──
DO $$
DECLARE
  legacy_total BIGINT;
  unified_total BIGINT;
  tokens_emargement BIGINT;
  fk_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_total FROM formation_convention_documents;
  SELECT COUNT(*) INTO unified_total FROM documents;
  SELECT COUNT(*) INTO tokens_emargement FROM signing_tokens
    WHERE token_purpose = 'emargement' OR document_id IS NULL;
  SELECT COUNT(*) INTO fk_count FROM pg_constraint
    WHERE conname IN ('signing_tokens_document_id_fkey', 'document_signatures_document_id_fkey');

  RAISE NOTICE '[cleanup] APRÈS : legacy=% rows, documents=% rows, signing_tokens(émargement)=% rows préservés',
    legacy_total, unified_total, tokens_emargement;
  RAISE NOTICE '[cleanup] FKs recréées : % constraints sur documents(id) (attendu 2)', fk_count;

  IF legacy_total = 0 AND unified_total = 0 AND fk_count = 2 THEN
    RAISE NOTICE '[cleanup] ✓ Cleanup complet. Loris peut re-créer ses données, elles iront dans documents.';
  ELSE
    RAISE NOTICE '[cleanup] ⚠ État inattendu — investiguer.';
  END IF;
END $$;

-- ── 5. (OPTIONNEL — Lot E plus tard) Drop table legacy ──
-- À décommenter UNIQUEMENT après ≥ 7 jours stabilité prod (story Lot E) :
--
-- DROP TABLE formation_convention_documents CASCADE;
--
-- Pour l'instant on garde le schéma vide pour rollback éventuel.
