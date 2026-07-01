-- Trace le pack d'automatisation choisi à la création d'une formation (Lot 3).
-- Le snapshot réel des étapes vit dans session_automation_steps (Lot 1) ;
-- cette colonne est la référence de haut niveau (utile au « réappliquer » du Lot 4).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS automation_pack_id UUID REFERENCES automation_packs(id) ON DELETE SET NULL;
