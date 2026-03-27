-- ============================================================
-- La Veille : notes internes de veille réglementaire
-- ============================================================

CREATE TABLE IF NOT EXISTS veille_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  source TEXT,
  url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE veille_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON veille_notes
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_veille_notes_entity ON veille_notes (entity_id);
