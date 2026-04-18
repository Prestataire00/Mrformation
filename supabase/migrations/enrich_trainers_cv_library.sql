-- ============================================================
-- Migration : CVthèque formateurs enrichie
-- ============================================================

-- Enrichir trainers
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS cv_url TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS cv_uploaded_at TIMESTAMPTZ;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS experience_years INTEGER;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS seniority_level TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS languages JSONB DEFAULT '[]';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS formation_domains TEXT[] DEFAULT '{}';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS ai_keywords TEXT[] DEFAULT '{}';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS ai_target_audience TEXT[] DEFAULT '{}';
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT 0;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS total_hours INTEGER DEFAULT 0;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS avg_satisfaction DECIMAL(3,1);
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS last_session_date DATE;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS qualiopi_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS qualiopi_missing JSONB DEFAULT '[]';

-- Taxonomie compétences
CREATE TABLE IF NOT EXISTS competency_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  parent_id UUID REFERENCES competency_taxonomy(id) ON DELETE SET NULL,
  synonyms TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, name)
);

ALTER TABLE competency_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competency_taxonomy_entity" ON competency_taxonomy
  FOR ALL TO authenticated
  USING (entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- Trigger stats auto
CREATE OR REPLACE FUNCTION refresh_trainer_stats(p_trainer_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE trainers SET
    total_sessions = (SELECT COUNT(DISTINCT session_id) FROM formation_trainers WHERE trainer_id = p_trainer_id),
    total_hours = COALESCE((SELECT SUM(COALESCE(hours_done, 0))::INTEGER FROM formation_trainers WHERE trainer_id = p_trainer_id), 0),
    last_session_date = (SELECT MAX(s.end_date::DATE) FROM formation_trainers ft JOIN sessions s ON s.id = ft.session_id WHERE ft.trainer_id = p_trainer_id)
  WHERE id = p_trainer_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_refresh_trainer_stats()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_trainer_stats(COALESCE(NEW.trainer_id, OLD.trainer_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS formation_trainers_stats_trigger ON formation_trainers;
CREATE TRIGGER formation_trainers_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON formation_trainers
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_trainer_stats();
