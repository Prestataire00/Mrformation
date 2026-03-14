-- ============================================================
-- Migration: Onglet 11 (Convention & Documents) — documents contractuels par formation
-- ============================================================

CREATE TABLE IF NOT EXISTS formation_convention_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'convocation', 'certificat_realisation', 'attestation_assiduite',
    'feuille_emargement', 'micro_certificat',
    'cgv', 'politique_confidentialite', 'reglement_interieur', 'programme_formation',
    'convention_entreprise', 'feuille_emargement_collectif',
    'convention_intervention', 'contrat_sous_traitance',
    'custom'
  )),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('learner', 'company', 'trainer')),
  owner_id UUID NOT NULL,
  template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  is_confirmed BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  is_signed BOOLEAN DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  document_date DATE,
  custom_label TEXT,
  requires_signature BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, doc_type, owner_type, owner_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_fcd_session ON formation_convention_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_fcd_owner ON formation_convention_documents(session_id, owner_type, owner_id);

ALTER TABLE formation_convention_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fcd_entity_access" ON formation_convention_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE s.id = formation_convention_documents.session_id
      AND p.id = auth.uid()
    )
  );
