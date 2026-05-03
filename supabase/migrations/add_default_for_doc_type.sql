-- ============================================================
-- Migration : Templates Word "par défaut" pour un type de doc système
-- ============================================================
-- Permet de désigner un template Word custom (mode docx_fidelity) comme
-- modèle PAR DÉFAUT pour un type de document système (convocation, convention,
-- programme, etc.). Quand un email auto ou un tab Convention&Documents
-- demande à générer ce type, on utilise le template Word custom au lieu
-- du template HTML hardcodé.
--
-- Bénéfice : 1 seul changement = effet global sur toutes les formations.
-- L'admin n'a plus à associer manuellement son Word custom à chaque doc
-- de chaque formation.
--
-- Convention :
--   - default_for_doc_type = NULL → comportement classique (template normal)
--   - default_for_doc_type = "convocation" → ce template Word remplace le
--     rendu système quand un doc de type "convocation" est généré
--
-- Une seule entrée par (entity_id, default_for_doc_type) — l'admin ne
-- peut pas avoir 2 templates Word par défaut pour le même type.
-- ============================================================

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS default_for_doc_type TEXT;

-- Contrainte d'unicité : 1 seul template par défaut par type/entité
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_templates_default_per_type_entity
  ON document_templates(entity_id, default_for_doc_type)
  WHERE default_for_doc_type IS NOT NULL;

-- Index pour les lookups fréquents (resolver, generateDocHtml)
CREATE INDEX IF NOT EXISTS idx_doc_templates_default_for_doc_type
  ON document_templates(entity_id, default_for_doc_type)
  WHERE default_for_doc_type IS NOT NULL;

-- ============================================================
-- Vérification :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'document_templates' AND column_name = 'default_for_doc_type';
-- ============================================================
