-- ============================================================
-- Formation Finances: invoices + charges
-- ============================================================

-- 1. Factures de formation (apprenant, entreprise, financeur)
CREATE TABLE IF NOT EXISTS formation_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (
    recipient_type IN ('learner', 'company', 'financier')
  ),
  recipient_id UUID NOT NULL,
  recipient_name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  prefix TEXT DEFAULT 'FAC',
  number INTEGER NOT NULL,
  reference TEXT GENERATED ALWAYS AS (prefix || '-' || number::TEXT) STORED,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'paid', 'late', 'cancelled')
  ),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  is_avoir BOOLEAN DEFAULT FALSE,
  parent_invoice_id UUID REFERENCES formation_invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE formation_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON formation_invoices
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_formation_invoices_session ON formation_invoices (session_id);
CREATE INDEX idx_formation_invoices_entity ON formation_invoices (entity_id);

-- 2. Charges liées à une formation
CREATE TABLE IF NOT EXISTS formation_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE formation_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON formation_charges
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_formation_charges_session ON formation_charges (session_id);
