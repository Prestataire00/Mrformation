-- ============================================================
-- Story h-8 (Epic H) : Champs pédagogiques au niveau session
-- ============================================================
-- Permet d'override au niveau session les champs pédagogiques qui étaient
-- jusqu'ici uniquement définis au niveau `program` (table programs.content
-- JSONB) ou `training` (trainings.objectives).
--
-- Cas d'usage : l'admin crée une session sans programme attaché, OU le
-- programme attaché est minimal/incomplet. Il veut quand même que les PDFs
-- (programme_formation, certificat_realisation, etc.) soient complets.
--
-- Stratégie de fallback dans le resolver (cf resolve-variables.ts) :
--   session.X → program.content.X → training.X → fallback "[X à préciser]"
--
-- Idempotent : ADD COLUMN IF NOT EXISTS sur chaque champ.
-- ============================================================

-- Objectifs pédagogiques (texte libre, peut être multi-lignes / bullet list)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pedagogical_objectives TEXT;

-- Contenu / progression pédagogique (texte libre, peut contenir HTML simple)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pedagogical_content TEXT;

-- Profil du stagiaire (à qui s'adresse la formation)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS target_audience TEXT;

-- Prérequis (compétences ou conditions requises avant la formation)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS prerequisites TEXT;

-- Équipe pédagogique (description du formateur + équipe)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS team_description TEXT;

-- Moyens pédagogiques (texte libre — alternative aux arrays JSONB du program)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pedagogical_resources TEXT;

-- Dispositif d'évaluation (texte libre — alternative aux arrays JSONB du program)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS evaluation_methods TEXT;

-- Modalité d'accès et délais
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS access_modality TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS access_delay_days INTEGER;

-- ============================================================
-- Vérification post-exécution :
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'sessions' AND column_name LIKE '%pedagogical%';
--   -- doit retourner pedagogical_objectives, pedagogical_content, pedagogical_resources
-- ============================================================
