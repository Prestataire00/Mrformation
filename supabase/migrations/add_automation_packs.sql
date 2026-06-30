-- Packs d'automatisation éditables (Lot 1 socle)
-- 3 tables : packs (gabarit) + pack_steps (étapes gabarit) + session_automation_steps (snapshot par formation)

CREATE TABLE IF NOT EXISTS automation_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_pack_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES automation_packs(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL,
  days_offset INTEGER NOT NULL DEFAULT 0,
  recipient_type TEXT,
  document_type TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  condition_subcontracted BOOLEAN DEFAULT NULL,
  send_email BOOLEAN DEFAULT true,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_automation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_pack_id UUID REFERENCES automation_packs(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL,
  days_offset INTEGER NOT NULL DEFAULT 0,
  recipient_type TEXT,
  document_type TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  condition_subcontracted BOOLEAN DEFAULT NULL,
  send_email BOOLEAN DEFAULT true,
  name TEXT,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  last_executed_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE automation_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_pack_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_automation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packs_entity_isolation" ON automation_packs
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "pack_steps_entity_isolation" ON automation_pack_steps
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM automation_packs p
    JOIN profiles pr ON pr.entity_id = p.entity_id
    WHERE p.id = automation_pack_steps.pack_id AND pr.id = auth.uid()
  ));

CREATE POLICY "session_steps_entity_isolation" ON session_automation_steps
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN profiles pr ON pr.entity_id = s.entity_id
    WHERE s.id = session_automation_steps.session_id AND pr.id = auth.uid()
  ));

CREATE INDEX idx_automation_packs_entity ON automation_packs (entity_id);
CREATE INDEX idx_automation_pack_steps_pack ON automation_pack_steps (pack_id);
CREATE INDEX idx_session_automation_steps_session ON session_automation_steps (session_id);
CREATE INDEX idx_session_automation_steps_trigger ON session_automation_steps (trigger_type) WHERE is_enabled = true;
