-- ============================================================
-- Migration : Signature électronique des devis
-- Étend signing_tokens pour supporter les devis
-- Date : 2026-04-06
-- ============================================================

-- 1. Étendre signing_tokens pour les devis
-- Rendre session_id nullable (les devis n'ont pas de session)
ALTER TABLE signing_tokens ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE signing_tokens ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES crm_quotes(id) ON DELETE CASCADE;

-- Mettre à jour la contrainte token_purpose pour inclure 'quote_signature'
ALTER TABLE signing_tokens DROP CONSTRAINT IF EXISTS signing_tokens_token_purpose_check;
ALTER TABLE signing_tokens ADD CONSTRAINT signing_tokens_token_purpose_check
  CHECK (token_purpose IN ('emargement', 'document_signature', 'quote_signature'));

-- 2. Colonnes de suivi sur crm_quotes
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS signature_token UUID;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS signature_requested_at TIMESTAMPTZ;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS signer_name TEXT;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS signer_ip TEXT;

-- 3. Table signatures devis (preuve légale)
CREATE TABLE IF NOT EXISTS quote_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signature_data TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quote_id)
);

ALTER TABLE quote_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_sig_entity_access" ON quote_signatures
  FOR ALL USING (
    entity_id IN (
      SELECT entity_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_signing_tokens_quote ON signing_tokens(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_signatures_quote ON quote_signatures(quote_id);
