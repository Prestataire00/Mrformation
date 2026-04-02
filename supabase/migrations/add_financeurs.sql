-- Table financeurs
CREATE TABLE IF NOT EXISTS financeurs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  type TEXT DEFAULT 'opco' CHECK (type IN ('opco', 'entreprise', 'cpf', 'autre')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE financeurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financeurs_admin_all" ON financeurs
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'super_admin')
    AND entity_id = public.user_entity_id()
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'super_admin')
    AND entity_id = public.user_entity_id()
  );
