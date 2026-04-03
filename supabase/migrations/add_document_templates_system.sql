-- ============================================================
-- Migration : Distinction templates système vs custom
-- Date : 2026-04-03
-- ============================================================

-- 1. Nouvelles colonnes
ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS system_key TEXT;

ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS source_docx_url TEXT;

-- 2. Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_doc_templates_is_system
ON document_templates(is_system);

-- 3. Contrainte d'unicité sur (system_key, entity_id)
-- Un même template système ne peut exister qu'une fois par entité
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_templates_system_key_entity
ON document_templates(system_key, entity_id)
WHERE system_key IS NOT NULL;

-- 4. Seed des 11 templates système pour chaque entité existante
-- Le content reste vide — il sera chargé depuis le code TypeScript
-- tant que l'admin ne le personnalise pas
INSERT INTO document_templates
  (name, type, is_system, system_key, content, variables, entity_id)
SELECT
  t.name, t.type, true, t.system_key, '', '[]'::jsonb, e.id
FROM (VALUES
  ('Convention de formation',             'agreement',   'convention_entreprise'),
  ('Feuille d''émargement collective',    'attendance',  'feuille_emargement'),
  ('Programme de formation',              'other',       'programme_formation'),
  ('Conditions Générales de Vente',       'other',       'cgv'),
  ('Règlement intérieur',                 'other',       'reglement_interieur'),
  ('Politique RGPD',                      'other',       'politique_confidentialite'),
  ('Convocation à la formation',          'certificate', 'convocation'),
  ('Certificat de réalisation',           'certificate', 'certificat_realisation'),
  ('Attestation d''assiduité',            'attendance',  'attestation_assiduite'),
  ('Feuille d''émargement individuelle',  'attendance',  'feuille_emargement_individuelle'),
  ('Certificat de réussite',              'certificate', 'micro_certificat')
) AS t(name, type, system_key)
CROSS JOIN entities e
ON CONFLICT DO NOTHING;
