-- Cache Pappers pour économiser le quota API (TTL 30 jours)
CREATE TABLE IF NOT EXISTS pappers_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siret TEXT UNIQUE NOT NULL,
  siren TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT 'company',
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_pappers_cache_siret ON pappers_cache(siret);
CREATE INDEX IF NOT EXISTS idx_pappers_cache_expires ON pappers_cache(expires_at);

ALTER TABLE pappers_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pappers_cache_read" ON pappers_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pappers_cache_write" ON pappers_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
