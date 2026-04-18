-- ============================================================
-- Migration : Support factures externes (import PDF)
-- ============================================================

ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT FALSE;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS external_pdf_url TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS external_source TEXT;
