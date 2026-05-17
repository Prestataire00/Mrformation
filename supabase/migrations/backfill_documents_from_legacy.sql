-- ============================================================
-- Migration : Backfill `documents` depuis tables legacy (Story B2)
-- ============================================================
-- Peuple la table `documents` unifiée (créée par b-1, PR #39) depuis
-- les rows historiques de `formation_convention_documents` (source
-- principale, ~80% du volume).
--
-- IDEMPOTENT : peut être rejouée sans risque grâce à :
--   1. Filtre `WHERE NOT EXISTS (...)` qui skip les rows déjà présentes
--   2. UNIQUE INDEX `documents_unique_source_owner` (créé par b-1) qui
--      bloque tout doublon résiduel
--
-- Traçabilité : chaque row backfilled garde son legacy_id dans
-- `documents.metadata.legacy_id` pour rollback facile si besoin.
--
-- Pré-requis : avoir run G1 (COUNT volume historique) pour valider
-- l'ordre de grandeur attendu, et G2 (rollback plan, doc séparée).
-- ============================================================

-- ── 0. Pré-flight : compteur AVANT backfill (visibilité) ──
DO $$
DECLARE
  legacy_total BIGINT;
  unified_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_total FROM formation_convention_documents;
  SELECT COUNT(*) INTO unified_total FROM documents
    WHERE metadata->>'legacy_table' = 'formation_convention_documents';

  RAISE NOTICE '[backfill] Pré-flight : legacy=% rows, déjà backfilled=% rows',
    legacy_total, unified_total;
END $$;

-- ── 1. Backfill formation_convention_documents → documents ──
-- Mapping :
--   entity_id     ← sessions.entity_id (join)
--   doc_type      ← fcd.doc_type (verbatim)
--   template_id   ← fcd.template_id
--   source_table  ← 'sessions' (toujours, legacy est session-based)
--   source_id     ← fcd.session_id
--   owner_type    ← fcd.owner_type (compatible : learner/company/trainer)
--   owner_id      ← fcd.owner_id
--   status        ← dérivé : signed > sent > generated > draft
--   generated_at  ← fcd.confirmed_at (proxy : confirmé = figé = généré)
--   sent_at       ← fcd.sent_at
--   signed_at     ← fcd.signed_at
--   metadata      ← jsonb avec legacy_id + champs additionnels
--   created_at    ← fcd.created_at (préservé pour traçabilité chrono)
--
-- IMPORTANT — DISTINCT ON pour dédoublonnage :
-- La table legacy `formation_convention_documents` autorise plusieurs rows
-- pour le même (session, doc_type, owner) si template_id diffère (sa UNIQUE
-- inclut template_id). La nouvelle table `documents` n'inclut PAS template_id
-- dans sa UNIQUE → on dédoublonne en gardant la row la plus AVANCÉE en
-- workflow (signed > sent > confirmed > draft) puis la plus récente.
INSERT INTO documents (
  entity_id, doc_type, template_id, source_table, source_id,
  owner_type, owner_id, status,
  generated_at, sent_at, signed_at,
  metadata, created_at
)
SELECT DISTINCT ON (
  s.entity_id, fcd.session_id, fcd.doc_type,
  COALESCE(fcd.owner_type, ''), COALESCE(fcd.owner_id::text, '')
)
  s.entity_id,
  fcd.doc_type,
  fcd.template_id,
  'sessions' AS source_table,
  fcd.session_id AS source_id,
  fcd.owner_type,
  fcd.owner_id,
  CASE
    WHEN fcd.is_signed THEN 'signed'
    WHEN fcd.is_sent THEN 'sent'
    WHEN fcd.is_confirmed THEN 'generated'
    ELSE 'draft'
  END AS status,
  fcd.confirmed_at AS generated_at,
  fcd.sent_at,
  fcd.signed_at,
  jsonb_build_object(
    'legacy_id', fcd.id,
    'legacy_table', 'formation_convention_documents',
    'document_date', fcd.document_date,
    'custom_label', fcd.custom_label,
    'requires_signature', fcd.requires_signature,
    'is_confirmed', fcd.is_confirmed,
    'confirmed_at', fcd.confirmed_at
  ) AS metadata,
  fcd.created_at
FROM formation_convention_documents fcd
JOIN sessions s ON s.id = fcd.session_id
WHERE NOT EXISTS (
  SELECT 1 FROM documents d
  WHERE d.entity_id = s.entity_id
    AND d.source_table = 'sessions'
    AND d.source_id = fcd.session_id
    AND d.doc_type = fcd.doc_type
    AND COALESCE(d.owner_type, '') = COALESCE(fcd.owner_type, '')
    AND COALESCE(d.owner_id::text, '') = COALESCE(fcd.owner_id::text, '')
)
ORDER BY
  -- Clés du DISTINCT ON en premier (obligatoire pour PostgreSQL)
  s.entity_id, fcd.session_id, fcd.doc_type,
  COALESCE(fcd.owner_type, ''), COALESCE(fcd.owner_id::text, ''),
  -- Priorité : on garde la row avec le statut le plus avancé en workflow
  CASE
    WHEN fcd.is_signed THEN 4
    WHEN fcd.is_sent THEN 3
    WHEN fcd.is_confirmed THEN 2
    ELSE 1
  END DESC,
  -- Tie-break : la plus récente (par created_at puis par id pour déterminisme)
  fcd.created_at DESC NULLS LAST,
  fcd.id DESC;

-- ── 2. Post-flight : rapport détaillé ──
DO $$
DECLARE
  legacy_total BIGINT;
  unified_total BIGINT;
  delta BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_total FROM formation_convention_documents;
  SELECT COUNT(*) INTO unified_total FROM documents
    WHERE metadata->>'legacy_table' = 'formation_convention_documents';
  delta := legacy_total - unified_total;

  RAISE NOTICE '[backfill] Post-flight : legacy=% rows, backfilled=% rows, delta=% rows',
    legacy_total, unified_total, delta;

  IF delta > 0 THEN
    RAISE NOTICE '[backfill] ⚠ Delta positif : % rows legacy non backfilled — vérifier sessions orphelines (FK cassée)',
      delta;
  ELSIF delta = 0 THEN
    RAISE NOTICE '[backfill] ✓ Backfill complet (100%% des rows legacy migrées)';
  ELSE
    RAISE NOTICE '[backfill] ⚠ Delta négatif (% rows en trop dans documents) — vérifier doublons',
      ABS(delta);
  END IF;
END $$;

-- ── 3. Verification : ventilation par doc_type ──
SELECT
  d.doc_type,
  d.status,
  COUNT(*) AS backfilled_count
FROM documents d
WHERE d.metadata->>'legacy_table' = 'formation_convention_documents'
GROUP BY d.doc_type, d.status
ORDER BY backfilled_count DESC;

-- ── 4. Verification : alignement statuts legacy vs unified ──
WITH legacy_status AS (
  SELECT
    fcd.doc_type,
    CASE
      WHEN fcd.is_signed THEN 'signed'
      WHEN fcd.is_sent THEN 'sent'
      WHEN fcd.is_confirmed THEN 'generated'
      ELSE 'draft'
    END AS expected_status,
    COUNT(*) AS cnt
  FROM formation_convention_documents fcd
  GROUP BY fcd.doc_type,
    CASE
      WHEN fcd.is_signed THEN 'signed'
      WHEN fcd.is_sent THEN 'sent'
      WHEN fcd.is_confirmed THEN 'generated'
      ELSE 'draft'
    END
),
unified_status AS (
  SELECT
    d.doc_type,
    d.status,
    COUNT(*) AS cnt
  FROM documents d
  WHERE d.metadata->>'legacy_table' = 'formation_convention_documents'
  GROUP BY d.doc_type, d.status
)
SELECT
  COALESCE(l.doc_type, u.doc_type) AS doc_type,
  COALESCE(l.expected_status, u.status) AS status,
  COALESCE(l.cnt, 0) AS legacy_cnt,
  COALESCE(u.cnt, 0) AS unified_cnt,
  (COALESCE(u.cnt, 0) - COALESCE(l.cnt, 0)) AS delta
FROM legacy_status l
FULL OUTER JOIN unified_status u
  ON l.doc_type = u.doc_type AND l.expected_status = u.status
WHERE COALESCE(u.cnt, 0) <> COALESCE(l.cnt, 0)
ORDER BY ABS(COALESCE(u.cnt, 0) - COALESCE(l.cnt, 0)) DESC;
-- Attendu : 0 rows (tous les statuts alignés). Si rows présentes → investiguer.
