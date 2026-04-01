-- Table pour les champs personnalisables CRM
CREATE TABLE IF NOT EXISTS crm_custom_fields (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'date', 'boolean')),
  options JSONB DEFAULT '[]', -- pour les champs "select": ["Option A", "Option B"]
  is_required BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valeurs des champs personnalisables par prospect
CREATE TABLE IF NOT EXISTS crm_custom_field_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES crm_custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prospect_id, field_id)
);

-- Table pour les séquences email automatisées
CREATE TABLE IF NOT EXISTS crm_sequences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Étapes d'une séquence
CREATE TABLE IF NOT EXISTS crm_sequence_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES crm_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 1,
  delay_days INTEGER NOT NULL DEFAULT 0, -- jours après l'étape précédente
  action_type TEXT NOT NULL CHECK (action_type IN ('email', 'task', 'wait')),
  email_subject TEXT,
  email_body TEXT,
  task_title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inscription d'un prospect dans une séquence
CREATE TABLE IF NOT EXISTS crm_sequence_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES crm_sequences(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES crm_prospects(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  next_action_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(sequence_id, prospect_id)
);

-- RLS
ALTER TABLE crm_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_custom_fields_entity" ON crm_custom_fields
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "crm_custom_field_values_access" ON crm_custom_field_values
  FOR ALL TO authenticated
  USING (field_id IN (SELECT id FROM crm_custom_fields WHERE entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (field_id IN (SELECT id FROM crm_custom_fields WHERE entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "crm_sequences_entity" ON crm_sequences
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "crm_sequence_steps_access" ON crm_sequence_steps
  FOR ALL TO authenticated
  USING (sequence_id IN (SELECT id FROM crm_sequences WHERE entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (sequence_id IN (SELECT id FROM crm_sequences WHERE entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "crm_sequence_enrollments_access" ON crm_sequence_enrollments
  FOR ALL TO authenticated
  USING (sequence_id IN (SELECT id FROM crm_sequences WHERE entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (sequence_id IN (SELECT id FROM crm_sequences WHERE entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())));
