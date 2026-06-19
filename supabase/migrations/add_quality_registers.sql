-- ============================================================
-- Registres Qualiopi : Amélioration continue (critère 32) & Incidents/réclamations
-- Persistance des 2 registres admin/reports/{amelioration,incidents} qui
-- vivaient jusqu'ici uniquement en state React (perdus au refresh).
-- À exécuter dans le Dashboard Supabase (comme les autres migrations).
-- ============================================================

-- ---------- Amélioration continue (Indicateur 32) ----------
CREATE TABLE IF NOT EXISTS quality_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  action_taken TEXT,
  result TEXT,
  responsible TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_improvements_entity ON quality_improvements (entity_id);

ALTER TABLE quality_improvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON quality_improvements
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

-- ---------- Incidents / réclamations qualité ----------
-- statut/source/sujet/gravite restent en TEXT (pas d'ENUM) : valeurs déjà
-- contraintes côté front, on garde de la souplesse (YAGNI).
CREATE TABLE IF NOT EXISTS quality_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  nom TEXT,
  description TEXT,
  statut TEXT,
  source TEXT,
  sujet TEXT,
  gravite TEXT,
  formation TEXT,
  action_menee TEXT,
  date_cloture DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_incidents_entity ON quality_incidents (entity_id);

ALTER TABLE quality_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_isolation" ON quality_incidents
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));
