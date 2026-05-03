-- ============================================================
-- Migration : Mode hybride pour document_templates
-- ============================================================
-- Ajoute une colonne `mode` qui distingue 2 types de templates :
--   - 'editable'      : HTML stocké dans `content`, éditable via éditeur Tiptap.
--                       Rendu PDF = HTML → CloudConvert (Chrome).
--   - 'docx_fidelity' : .docx original stocké dans Storage (`source_docx_url`).
--                       Pas d'édition côté plateforme (l'admin édite dans Word).
--                       Rendu PDF = .docx → CloudConvert (LibreOffice, fidélité ~99%).
--                       Variables {{xxx}} substituées via docxtemplater côté serveur.
--
-- La colonne `source_docx_url` existe déjà (migration add_document_templates_system.sql).
-- ============================================================

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'editable'
    CHECK (mode IN ('editable', 'docx_fidelity'));

-- Storage path pour permettre la suppression du fichier Storage à la suppression du template
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS source_docx_path TEXT;

-- Index pour filtrer les templates par mode (debug + UI)
CREATE INDEX IF NOT EXISTS idx_doc_templates_mode
  ON document_templates(entity_id, mode);

-- ============================================================
-- Vérification :
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'document_templates' AND column_name IN ('mode','source_docx_url','source_docx_path');
-- ============================================================
