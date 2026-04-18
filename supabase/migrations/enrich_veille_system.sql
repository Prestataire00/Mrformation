-- ============================================================
-- Migration : Veille réglementaire enrichie avec classification IA
-- ============================================================

-- Enrichir veille_notes
ALTER TABLE veille_notes ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE veille_notes ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE veille_notes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE veille_notes ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE veille_notes ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE veille_notes ADD COLUMN IF NOT EXISTS ai_impact TEXT;
ALTER TABLE veille_notes ADD COLUMN IF NOT EXISTS ai_actions JSONB DEFAULT '[]'::jsonb;

-- Articles RSS sauvegardés et analysés
CREATE TABLE IF NOT EXISTS veille_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  source TEXT,
  pub_date TIMESTAMPTZ,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  relevance_score INTEGER,
  ai_summary TEXT,
  ai_impact TEXT,
  ai_actions JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'new',
  dismissed_reason TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, url)
);

ALTER TABLE veille_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "veille_articles_entity" ON veille_articles
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_veille_articles_status ON veille_articles(entity_id, status);

-- Sources RSS custom par entité
CREATE TABLE IF NOT EXISTS veille_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE veille_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "veille_sources_entity" ON veille_sources
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));
