-- ============================================================
-- Durcissement : empêcher les doublons d'inscription.
-- Contexte : la contrainte UNIQUE(session_id, learner_id) est déclarée dans schema.sql
-- mais ABSENTE en prod (dérive). Tant qu'elle manque, rien n'empêche un même apprenant
-- d'être inscrit 2× sur une session (re-import, action manuelle) — cause du type de bug
-- d'inscriptions mal réparties. On dédoublonne puis on ajoute la contrainte.
-- À exécuter dans Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1. Supprimer d'éventuels doublons existants (garde la ligne la plus ancienne par paire).
--    learner_id NULL ignoré (NULLs distincts en SQL).
DELETE FROM enrollments a
USING enrollments b
WHERE a.learner_id IS NOT NULL
  AND a.session_id = b.session_id
  AND a.learner_id = b.learner_id
  AND a.id > b.id;

-- 2. Ajouter la contrainte d'unicité (idempotent).
ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_session_learner_unique;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_session_learner_unique UNIQUE (session_id, learner_id);

-- Contrôle : doit renvoyer 0 (plus aucun doublon possible).
-- SELECT session_id, learner_id, count(*) FROM enrollments
--   WHERE learner_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
