-- ============================================================
-- Migration : Relances automatiques de factures
-- Date : 2026-04-06
-- ============================================================

-- 1. Table de suivi des relances envoyées
CREATE TABLE IF NOT EXISTS invoice_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES formation_invoices(id) ON DELETE CASCADE NOT NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('first', 'second', 'final')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  email_to TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice
ON invoice_reminders(invoice_id);

-- 2. Colonnes de suivi sur les factures
ALTER TABLE formation_invoices
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

ALTER TABLE formation_invoices
ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

-- 3. RLS pour invoice_reminders
ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_reminders_entity_isolation"
ON invoice_reminders FOR ALL
USING (entity_id IN (
  SELECT entity_id FROM profiles WHERE id = auth.uid()
));
