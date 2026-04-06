-- ============================================================
-- Migration : Fix devis — lignes, numérotation, financeur, relances
-- Date : 2026-04-06
-- ============================================================

-- ═══ ÉTAPE 1 : Colonnes manquantes + migration lignes JSON ═══

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Migration des lignes JSON existantes vers crm_quote_lines
DO $$
DECLARE
  r RECORD;
  line JSONB;
BEGIN
  FOR r IN SELECT id, notes FROM crm_quotes WHERE notes IS NOT NULL AND notes::text LIKE '%"lines"%' LOOP
    BEGIN
      FOR line IN SELECT jsonb_array_elements((r.notes::jsonb)->'lines') LOOP
        INSERT INTO crm_quote_lines (quote_id, description, quantity, unit_price)
        VALUES (
          r.id,
          COALESCE(line->>'description', ''),
          COALESCE((line->>'quantity')::decimal, 1),
          COALESCE((line->>'unit_price')::decimal, 0)
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Skip malformed JSON
    END;
  END LOOP;
END $$;

-- ═══ ÉTAPE 2 : Numérotation robuste + versioning ═══

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS quote_number INTEGER;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS fiscal_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_TIMESTAMP);
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES crm_quotes(id) ON DELETE SET NULL;

-- Remplir les existants
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY entity_id, EXTRACT(YEAR FROM created_at) ORDER BY created_at) AS rn,
    EXTRACT(YEAR FROM created_at)::integer AS yr
  FROM crm_quotes
  WHERE quote_number IS NULL
)
UPDATE crm_quotes SET quote_number = numbered.rn, fiscal_year = numbered.yr
FROM numbered WHERE crm_quotes.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_quotes_global_number
ON crm_quotes (entity_id, fiscal_year, quote_number)
WHERE quote_number IS NOT NULL;

-- ═══ ÉTAPE 3 : Lien financeur/OPCO ═══

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS financeur_id UUID REFERENCES financeurs(id) ON DELETE SET NULL;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS funding_type TEXT DEFAULT 'direct'
  CHECK (funding_type IN ('direct', 'opco', 'cpf', 'mixte'));
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS opco_amount DECIMAL(10,2);

-- ═══ ÉTAPE 4 : Relances devis ═══

CREATE TABLE IF NOT EXISTS crm_quote_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('first', 'second', 'final')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  email_to TEXT
);

CREATE INDEX IF NOT EXISTS idx_crm_quote_reminders_quote ON crm_quote_reminders(quote_id);

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

ALTER TABLE crm_quote_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_quote_reminders_entity_isolation"
ON crm_quote_reminders FOR ALL
USING (entity_id IN (
  SELECT entity_id FROM profiles WHERE id = auth.uid()
));
