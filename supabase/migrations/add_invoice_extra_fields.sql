-- ============================================================
-- Migration : Champs supplémentaires facture (destinataire + référence)
-- ============================================================

ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS recipient_siret TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS recipient_address TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS recipient_postal_code TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS recipient_city TEXT;
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS participants_note TEXT;
-- external_reference déjà ajoutée dans add_formation_invoice_lines.sql
