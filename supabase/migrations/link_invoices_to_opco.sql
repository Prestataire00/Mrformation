-- ============================================================
-- Migration : Liaison factures ↔ dossiers OPCO
-- ============================================================

ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS opco_financier_id UUID
  REFERENCES formation_financiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_formation_invoices_opco ON formation_invoices(opco_financier_id);

-- Trigger : update status financier quand facture créée
CREATE OR REPLACE FUNCTION update_opco_status_on_invoice_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opco_financier_id IS NOT NULL THEN
    UPDATE formation_financiers
    SET status = CASE
      WHEN status IN ('a_deposer', 'deposee') THEN 'en_cours'
      ELSE status
    END,
    updated_at = NOW()
    WHERE id = NEW.opco_financier_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_opco_on_invoice ON formation_invoices;
CREATE TRIGGER trigger_update_opco_on_invoice
AFTER INSERT ON formation_invoices
FOR EACH ROW EXECUTE FUNCTION update_opco_status_on_invoice_insert();

-- Trigger : update status quand facture payée
CREATE OR REPLACE FUNCTION update_opco_status_on_invoice_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL AND NEW.opco_financier_id IS NOT NULL THEN
    UPDATE formation_financiers
    SET status = 'acceptee',
    response_date = NEW.paid_at::DATE,
    updated_at = NOW()
    WHERE id = NEW.opco_financier_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_opco_on_paid ON formation_invoices;
CREATE TRIGGER trigger_update_opco_on_paid
AFTER UPDATE ON formation_invoices
FOR EACH ROW EXECUTE FUNCTION update_opco_status_on_invoice_paid();
