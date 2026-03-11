-- ============================================================
-- Mise à jour des dates created_at des apprenants
-- Tous les apprenants existants → Février 2026
-- Comptes Adrien Coti (test) → Mars 2026
-- ============================================================

-- 1) Tous les apprenants en Février 2026 (dates variées pour réalisme)
UPDATE learners
SET created_at = '2026-02-01'::timestamptz + (random() * interval '27 days')
WHERE lower(first_name) NOT LIKE '%adrien%'
  AND lower(last_name) NOT LIKE '%coti%';

-- 2) Comptes Coti en Mars 2026
UPDATE learners
SET created_at = '2026-03-01 10:00:00+01'
WHERE lower(first_name) LIKE '%coti%'
   OR lower(last_name) LIKE '%coti%';

-- Vérification
SELECT
  to_char(created_at, 'YYYY-MM') AS mois,
  count(*) AS nb_apprenants
FROM learners
GROUP BY 1
ORDER BY 1;
