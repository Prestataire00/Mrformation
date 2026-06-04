-- Migration : elearning background pipeline (fix 504)
-- Ajoute generation_progress JSONB sur elearning_courses pour permettre
-- au frontend de poller l'état d'avancement d'un pipeline async lancé
-- par /.netlify/functions/elearning-generate-pipeline-background.
--
-- Format attendu :
-- {
--   "step": "outline" | "chapters" | "quiz" | "exam" | "gamma" | "done" | "failed",
--   "current": 1,            -- compteur de progression intra-étape
--   "total": 5,              -- borne intra-étape (ex: chapter 2/5)
--   "percent": 35,           -- progression globale 0-100
--   "message": "Chapitre 2/5 — Notions de base",
--   "started_at": "2026-06-04T08:12:00.000Z",
--   "updated_at": "2026-06-04T08:13:42.000Z",
--   "error": null            -- message si step = "failed"
-- }

ALTER TABLE elearning_courses
  ADD COLUMN IF NOT EXISTS generation_progress JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN elearning_courses.generation_progress IS
  'État temps réel du pipeline de génération background. Mis à jour par /.netlify/functions/elearning-generate-pipeline-background, lu via polling par le frontend.';
