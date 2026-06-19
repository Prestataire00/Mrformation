-- ============================================================
-- Contrats formateur visibles côté formateur (Mes Contrats).
--
-- Les contrats de sous-traitance (« convention d'intervention ») générés en
-- admin n'étaient pas persistés (PDF renvoyé à la volée) → invisibles pour le
-- formateur. On ajoute un lien `trainer_id` sur `generated_documents` pour
-- pouvoir rattacher un document à un formateur (et non plus seulement à une
-- session / un apprenant), puis la route de génération persiste le PDF.
--
-- À exécuter dans le SQL Editor du Dashboard Supabase (prod).
-- ============================================================

ALTER TABLE generated_documents
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generated_documents_trainer ON generated_documents (trainer_id);
