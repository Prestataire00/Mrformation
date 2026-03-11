-- Add address to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;

-- Create locations table for training venues
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view locations of their entity"
  ON locations FOR SELECT
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage locations"
  ON locations FOR ALL
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid() AND role = 'admin'));
