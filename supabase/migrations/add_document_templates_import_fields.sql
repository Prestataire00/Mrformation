-- ============================================================
-- Migration : Enrichissement document_templates pour Story D1 (page import)
-- ============================================================
-- Cf bmad_output/planning-artifacts/prd-documents.md §9.2.
--
-- Ajoute les colonnes pour le mécanisme d'import par lot des templates
-- Word/PDF par Loris (page `/admin/documents/import`) :
--   - default_for_doc_type : flag pour marquer ce template comme défaut
--     pour un type donné (utilisé par DocumentGenerationService).
--   - variables_detected : snapshot des variables `{{xxx}}` détectées
--     dans le .docx au moment de l'upload (audit + diagnostic).
--   - uploaded_at, uploaded_by : audit trail de l'upload.
--
-- Les colonnes existantes (is_system, system_key, source_docx_url, mode)
-- restent inchangées (cf add_document_templates_system.sql + add_document_templates_mode.sql).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS default_for_doc_type BOOLEAN DEFAULT FALSE;

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS variables_detected JSONB;

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index sur (entity_id, default_for_doc_type) pour permettre de retrouver
-- rapidement "quel est le template par défaut pour ce type d'entité" :
--   SELECT * FROM document_templates
--   WHERE entity_id = X AND default_for_doc_type = TRUE AND type = Y
--   LIMIT 1;
CREATE INDEX IF NOT EXISTS idx_document_templates_default
  ON document_templates (entity_id, type)
  WHERE default_for_doc_type = TRUE;

-- Vérification
SELECT
  COUNT(*) FILTER (WHERE column_name = 'default_for_doc_type') AS default_for_doc_type_present,
  COUNT(*) FILTER (WHERE column_name = 'variables_detected') AS variables_detected_present,
  COUNT(*) FILTER (WHERE column_name = 'uploaded_at') AS uploaded_at_present,
  COUNT(*) FILTER (WHERE column_name = 'uploaded_by') AS uploaded_by_present
FROM information_schema.columns
WHERE table_name = 'document_templates';
-- Attendu : tout à 1.
