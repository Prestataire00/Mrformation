-- ============================================================
-- Migration : Enrichissement document_templates pour Story D1 (page import)
-- ============================================================
-- Cf bmad_output/planning-artifacts/prd-documents.md §9.2.
--
-- Ajoute les colonnes pour le mécanisme d'import par lot des templates
-- Word/PDF par Loris (page `/admin/documents/import`).
--
-- IMPORTANT — sémantique `default_for_doc_type` :
-- La colonne EXISTE DÉJÀ en TEXT (cf migration add_default_for_doc_type.sql)
-- avec la convention : la valeur = nom du doc_type pour lequel ce template
-- est marqué comme défaut (ex : `default_for_doc_type = 'convention_entreprise'`).
-- NULL = pas de défaut.
-- Cette migration N'AJOUTE PAS cette colonne (existe déjà) — elle s'aligne
-- juste sur la sémantique existante côté code applicatif.
--
-- Les colonnes existantes (is_system, system_key, source_docx_url, mode)
-- restent inchangées (cf add_document_templates_system.sql + add_document_templates_mode.sql).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS variables_detected JSONB;

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index sur (entity_id, default_for_doc_type) pour permettre de retrouver
-- rapidement "quel est le template par défaut pour ce doc_type / entité" :
--   SELECT * FROM document_templates
--   WHERE entity_id = X AND default_for_doc_type = 'convention_entreprise'
--   LIMIT 1;
CREATE INDEX IF NOT EXISTS idx_document_templates_default
  ON document_templates (entity_id, default_for_doc_type)
  WHERE default_for_doc_type IS NOT NULL;

-- Vérification
SELECT
  COUNT(*) FILTER (WHERE column_name = 'default_for_doc_type') AS default_for_doc_type_present,
  COUNT(*) FILTER (WHERE column_name = 'variables_detected') AS variables_detected_present,
  COUNT(*) FILTER (WHERE column_name = 'uploaded_at') AS uploaded_at_present,
  COUNT(*) FILTER (WHERE column_name = 'uploaded_by') AS uploaded_by_present,
  (SELECT data_type FROM information_schema.columns
     WHERE table_name = 'document_templates' AND column_name = 'default_for_doc_type') AS default_for_doc_type_type
FROM information_schema.columns
WHERE table_name = 'document_templates';
-- Attendu : tout à 1, default_for_doc_type_type = 'text' (sémantique conservée).
