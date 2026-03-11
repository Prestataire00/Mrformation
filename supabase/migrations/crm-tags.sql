-- Migration: CRM Tags system for client/prospect categorization

CREATE TABLE IF NOT EXISTS crm_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, name)
);

CREATE TABLE IF NOT EXISTS crm_prospect_tags (
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES crm_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prospect_id, tag_id)
);

CREATE TABLE IF NOT EXISTS crm_client_tags (
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES crm_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, tag_id)
);

-- Add segment_tags to campaigns for tag-based targeting
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS segment_tags UUID[] DEFAULT '{}';

-- RLS
ALTER TABLE crm_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prospect_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_client_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access crm_tags" ON crm_tags
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Auth users full access crm_prospect_tags" ON crm_prospect_tags
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Auth users full access crm_client_tags" ON crm_client_tags
  FOR ALL TO authenticated USING (true);
