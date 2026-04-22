-- ============================================================
-- Migration : Correction des slots décalés suite au bug timezone
-- Contexte : Entre le 20/04/2026 (commit d1a8215) et ce fix,
--            les slots ont été stockés en ISO naïf sans timezone,
--            interprétés comme UTC par PostgreSQL au lieu de Paris.
-- Effet : décalage de +2h en lecture (été CEST).
-- ============================================================

-- ⚠️ EXÉCUTER MANUELLEMENT après validation par Loris.
-- Étape 1 : vérifier le nombre de slots concernés
-- SELECT COUNT(*) FROM formation_time_slots
-- WHERE created_at >= '2026-04-20 12:00:00+00' AND created_at <= NOW();

-- Étape 2 : si OK, corriger (soustraire 2h pour ramener en UTC correct)
-- UPDATE formation_time_slots
-- SET start_time = start_time - INTERVAL '2 hours',
--     end_time = end_time - INTERVAL '2 hours'
-- WHERE created_at >= '2026-04-20 12:00:00+00'
--   AND created_at <= NOW();

-- Étape 3 : vérifier post-update
-- SELECT id, title,
--        start_time AT TIME ZONE 'Europe/Paris' AS start_paris,
--        end_time AT TIME ZONE 'Europe/Paris' AS end_paris
-- FROM formation_time_slots
-- WHERE created_at >= '2026-04-20 12:00:00+00'
-- ORDER BY created_at DESC LIMIT 10;
