-- ============================================================
-- Diagnostic — Correction migration espace formation (Lot 0)
-- LECTURE SEULE (que des SELECT). À exécuter dans Supabase Dashboard → SQL Editor.
-- Chiffre les 3 trous + sert de mesure "avant" (à rejouer "après" pour valider).
--
-- NB : `learners` n'a PAS de colonne `metadata` → le marqueur `_unmatched_entreprise`
-- construit par loris_import.py n'a jamais été persisté. L'analyse "entreprise non
-- matchée / réparable auto vs ambigu" se fait donc dans le SCRIPT du Lot 1 (à partir
-- de stagiaires.csv), pas en SQL. Ici on chiffre seulement l'état en base.
-- ============================================================

-- 1A. Apprenants sans entreprise (client_id NULL), ventilés par entité
SELECT e.slug AS entite,
       count(*)                                    AS learners_total,
       count(*) FILTER (WHERE l.client_id IS NULL) AS sans_client_id
FROM learners l
JOIN entities e ON e.id = l.entity_id
GROUP BY e.slug
ORDER BY e.slug;

-- 2A. Sessions sans aucun créneau (cible du Lot 2), par entité
SELECT e.slug AS entite,
       count(*) AS sessions_total,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM formation_time_slots fts WHERE fts.session_id = s.id
       )) AS sessions_sans_creneaux
FROM sessions s
JOIN entities e ON e.id = s.entity_id
GROUP BY e.slug
ORDER BY e.slug;

-- 2B. Parmi les sessions sans créneaux : combien sont synthétisables (dates + heures présentes)
SELECT
  count(*) AS sans_creneaux,
  count(*) FILTER (WHERE s.start_date IS NOT NULL AND s.end_date IS NOT NULL
                     AND COALESCE(s.planned_hours,0) > 0) AS synthetisables,
  count(*) FILTER (WHERE s.start_date IS NULL OR s.end_date IS NULL
                     OR COALESCE(s.planned_hours,0) = 0) AS non_synthetisables
FROM sessions s
WHERE NOT EXISTS (SELECT 1 FROM formation_time_slots fts WHERE fts.session_id = s.id);

-- 3A. Enrollments : total + ceux dont l'apprenant n'a pas de client_id
SELECT
  count(*)                                    AS enrollments_total,
  count(*) FILTER (WHERE l.client_id IS NULL) AS enrollments_sans_client_id
FROM enrollments en
JOIN learners l ON l.id = en.learner_id;

-- 3B. Sessions à 0 inscrit (piste sur les 949 enrollments "skipped duplicates")
SELECT s.id AS session_id, s.title, count(en.id) AS nb_inscrits
FROM sessions s
LEFT JOIN enrollments en ON en.session_id = s.id
GROUP BY s.id, s.title
HAVING count(en.id) = 0
ORDER BY s.start_date DESC
LIMIT 50;

-- 3C. Combien de clients existent par entité (dénominateur pour le matching Lot 1)
SELECT e.slug AS entite, count(*) AS clients_total
FROM clients c JOIN entities e ON e.id = c.entity_id
GROUP BY e.slug ORDER BY e.slug;
