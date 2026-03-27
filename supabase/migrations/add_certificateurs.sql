-- ============================================================
-- Certificateurs : organismes certificateurs liés aux formations
-- ============================================================

CREATE TABLE IF NOT EXISTS certificateurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'autre' CHECK (
    type IN ('rncp', 'cqp', 'rs', 'titre_pro', 'autre')
  ),
  code TEXT,
  website TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE certificateurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON certificateurs
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_certificateurs_entity ON certificateurs (entity_id);

-- Lien formation → certificateur
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS certificateur_id UUID REFERENCES certificateurs(id) ON DELETE SET NULL;
