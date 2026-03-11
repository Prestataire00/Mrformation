-- Migration: Add detailed fields to crm_quotes for devis creation
-- Run this in the Supabase SQL Editor

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS tva DECIMAL(5,2) DEFAULT 20.00;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS training_start DATE;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS training_end DATE;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS effectifs INTEGER;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS duration TEXT;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS mention TEXT DEFAULT 'Conformément à l''article L. 441-6 du Code de Commerce, les pénalités de retard seront calculées à partir de 3 fois le taux d''intérêt légal en vigueur ainsi qu''une indemnité de 40€ seront dues à défaut de règlement le jour suivant la date de paiement figurant sur la facture.';

-- Quote line items
CREATE TABLE IF NOT EXISTS crm_quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES crm_quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_quote_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_quote_lines_all') THEN
    CREATE POLICY crm_quote_lines_all ON crm_quote_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
