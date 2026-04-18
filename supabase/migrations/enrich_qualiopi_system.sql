-- ============================================================
-- Migration : Qualiopi enrichi — snapshots, audits blancs, preuves
-- ============================================================

-- Snapshots Qualiopi par formation (historique)
CREATE TABLE IF NOT EXISTS qualiopi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  global_score INTEGER,
  items JSONB DEFAULT '{}',
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE qualiopi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualiopi_snapshots_entity" ON qualiopi_snapshots
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_qualiopi_snapshots_session ON qualiopi_snapshots(session_id, snapshot_date DESC);

-- Audits blancs IA
CREATE TABLE IF NOT EXISTS qualiopi_mock_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  audit_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  overall_verdict TEXT,
  findings JSONB DEFAULT '[]',
  action_plan JSONB DEFAULT '[]',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by UUID
);

ALTER TABLE qualiopi_mock_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualiopi_mock_audits_entity" ON qualiopi_mock_audits
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- Vérifications de preuves documentaires
CREATE TABLE IF NOT EXISTS qualiopi_proof_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  critere_num INTEGER NOT NULL,
  document_name TEXT,
  is_conforme BOOLEAN,
  conformity_score INTEGER,
  missing_elements JSONB DEFAULT '[]',
  present_elements JSONB DEFAULT '[]',
  recommendations TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  checked_by UUID
);

ALTER TABLE qualiopi_proof_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualiopi_proof_checks_entity" ON qualiopi_proof_checks
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));
