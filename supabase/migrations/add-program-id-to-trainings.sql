-- Ajouter la colonne program_id à trainings (liaison optionnelle vers le programme source)
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trainings_program ON trainings(program_id);
