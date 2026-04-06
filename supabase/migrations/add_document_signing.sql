-- ============================================================
-- Migration : Signature électronique des documents
-- Étend signing_tokens + crée document_signatures
-- Date : 2026-04-06
-- ============================================================

-- 1. Étendre signing_tokens pour les documents
ALTER TABLE signing_tokens ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES formation_convention_documents(id) ON DELETE CASCADE;
ALTER TABLE signing_tokens ADD COLUMN IF NOT EXISTS token_purpose TEXT DEFAULT 'emargement'
  CHECK (token_purpose IN ('emargement', 'document_signature'));

-- 2. Table des signatures de documents
CREATE TABLE IF NOT EXISTS document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES formation_convention_documents(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  signer_type TEXT NOT NULL CHECK (signer_type IN ('learner', 'company', 'trainer')),
  signer_id UUID NOT NULL,
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signature_data TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, signer_type, signer_id)
);

ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_sig_entity_access" ON document_signatures
  FOR ALL USING (
    session_id IN (
      SELECT s.id FROM sessions s
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE p.id = auth.uid()
    )
  );

-- 3. Colonnes de suivi sur formation_convention_documents
ALTER TABLE formation_convention_documents ADD COLUMN IF NOT EXISTS signature_token UUID;
ALTER TABLE formation_convention_documents ADD COLUMN IF NOT EXISTS signature_requested_at TIMESTAMPTZ;
ALTER TABLE formation_convention_documents ADD COLUMN IF NOT EXISTS signature_reminder_count INTEGER DEFAULT 0;
ALTER TABLE formation_convention_documents ADD COLUMN IF NOT EXISTS signer_name TEXT;
ALTER TABLE formation_convention_documents ADD COLUMN IF NOT EXISTS signer_email TEXT;
ALTER TABLE formation_convention_documents ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT;

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_doc_signatures_document ON document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signing_tokens_document ON signing_tokens(document_id);
CREATE INDEX IF NOT EXISTS idx_signing_tokens_purpose ON signing_tokens(token_purpose);
