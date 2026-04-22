-- Migration : Pièces jointes automatiques dans les modèles email
-- Date : 2026-04-22

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS attachment_doc_types TEXT[] DEFAULT '{}';

COMMENT ON COLUMN email_templates.attachment_doc_types IS
  'Types de documents à joindre automatiquement (convocation, convention_entreprise, certificat_realisation, programme_formation, etc.)';
