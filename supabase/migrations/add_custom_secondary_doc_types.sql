-- ============================================================
-- Catalogue des types de documents secondaires CUSTOM par entité.
--
-- Cohabite avec les 23 types secondaires legacy codés en dur
-- (src/lib/templates/secondary-categories.ts). Un type custom se
-- résout via `template_id` (document_templates uploadé) au lieu du
-- registry système, est non-signable en v1, et son destinataire
-- (owner_type) est figé à la création.
--
-- Isolation multi-tenant : un type custom n'est visible / attribuable
-- que dans son entité. RLS via public.user_role() (helpers en `public`,
-- pas `auth`).
--
-- ⚠️ À jouer manuellement dans Supabase AVANT le push.
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_secondary_doc_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  -- Clé stockée dans documents.doc_type (ex. "custom_a1b2c3d4e5f6").
  -- Générée serveur, jamais collision avec les 23 legacy.
  doc_type TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('habilitation', 'attestation_metier', 'administratif', 'evaluation')
  ),
  -- Destinataire figé à la création. 'session' → 1 doc attaché à la
  -- première entreprise (owner_type='company') côté attribution.
  owner_type TEXT NOT NULL DEFAULT 'learner' CHECK (
    owner_type IN ('learner', 'trainer', 'session')
  ),
  -- Template Word uploadé (docx_fidelity) obligatoire pour générer.
  template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE RESTRICT,
  -- Désactivation soft : retire du catalogue sans casser les docs déjà attribués.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unicité de la clé au sein de l'entité.
  CONSTRAINT custom_secondary_doc_types_entity_doctype_unique
    UNIQUE (entity_id, doc_type)
);

ALTER TABLE custom_secondary_doc_types ENABLE ROW LEVEL SECURITY;

-- Isolation par entité (USING sert aussi de WITH CHECK sur INSERT/UPDATE).
CREATE POLICY "entity_isolation" ON custom_secondary_doc_types
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- Super admin : accès cross-entité (helper en `public`).
CREATE POLICY "custom_secondary_doc_types_super_admin_all" ON custom_secondary_doc_types
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');

CREATE INDEX idx_custom_secondary_doc_types_entity
  ON custom_secondary_doc_types (entity_id);

-- Lecture fréquente du catalogue actif d'une entité.
CREATE INDEX idx_custom_secondary_doc_types_entity_active
  ON custom_secondary_doc_types (entity_id, is_active);
