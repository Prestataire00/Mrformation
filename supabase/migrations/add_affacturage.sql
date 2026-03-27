-- ============================================================
-- Affacturage : cession de créances à un factor
-- ============================================================

-- 1. Colonnes affacturage sur formation_invoices
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS is_factored BOOLEAN DEFAULT FALSE;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS factored_at TIMESTAMPTZ;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS factor_name TEXT;

-- 2. Lots d'affacturage (regroupement de factures cédées)
CREATE TABLE IF NOT EXISTS affacturage_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  lot_reference TEXT NOT NULL,
  factor_name TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  advance_rate DECIMAL(5,2) DEFAULT 90.00,
  advance_amount DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'paid', 'closed')
  ),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE affacturage_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON affacturage_lots
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_affacturage_lots_entity ON affacturage_lots (entity_id);

-- 3. Factures dans un lot (table pivot)
CREATE TABLE IF NOT EXISTS affacturage_lot_invoices (
  lot_id UUID NOT NULL REFERENCES affacturage_lots(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES formation_invoices(id) ON DELETE CASCADE,
  PRIMARY KEY (lot_id, invoice_id)
);

CREATE INDEX idx_affacturage_lot_invoices_invoice ON affacturage_lot_invoices (invoice_id);
