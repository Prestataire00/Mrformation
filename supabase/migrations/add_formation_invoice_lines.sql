-- ============================================================
-- Migration : Lignes de facture (comme crm_quote_lines)
-- ============================================================

CREATE TABLE IF NOT EXISTS formation_invoice_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES formation_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fil_invoice ON formation_invoice_lines(invoice_id);

ALTER TABLE formation_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fil_entity_access" ON formation_invoice_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM formation_invoices fi
      JOIN sessions s ON s.id = fi.session_id
      JOIN profiles p ON p.entity_id = s.entity_id
      WHERE fi.id = formation_invoice_lines.invoice_id
      AND p.id = auth.uid()
    )
  );

-- Champ référence externe sur les factures
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS external_reference TEXT;
