-- ============================================================
-- Migration : Preuve signature renforcée eIDAS simple
-- ============================================================

ALTER TABLE signatures ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS document_hash TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS evidence_pdf_url TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signed_document_url TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signature_method TEXT DEFAULT 'handwritten'
  CHECK (signature_method IN ('handwritten', 'typed', 'click_to_sign'));
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS geolocation JSONB;

-- Table de preuve immuable
CREATE TABLE IF NOT EXISTS signature_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id UUID NOT NULL REFERENCES signatures(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  data JSONB NOT NULL,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_signature_evidence_sig ON signature_evidence(signature_id);

ALTER TABLE signature_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signature_evidence_read" ON signature_evidence
  FOR SELECT TO authenticated
  USING (
    signature_id IN (
      SELECT s.id FROM signatures s
      JOIN sessions sess ON sess.id = s.session_id
      WHERE sess.entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "signature_evidence_insert" ON signature_evidence
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);
