-- ============================================================
-- Migration : h-20 backfill assigned_to = created_by sur crm_tasks
-- ============================================================
--
-- Contexte : à l'import Sellsy, le champ `assigned_to` n'a pas été mappé
-- côté code, donc resté NULL sur ~418 tâches actives (+ 1000+ terminées).
-- Conséquence : le dropdown filtre par propriétaire (h-20) affichait
-- "Lola (0) / Marc (0) / Taline (0)" car techniquement aucune tâche
-- n'a de owner — alors que toutes ont un `created_by` correct (Taline,
-- Lola lors de l'import). Décision produit Wissam (2026-05-18) :
-- backfill `assigned_to = created_by` quand assigned_to est NULL.
--
-- Sécurités :
-- - Filtre `created_by IS NOT NULL` : on ne tape pas les tâches sans créateur.
-- - Filtre `EXISTS profile` : on évite les FK orphelins (profils supprimés
--   ou cross-entity). Si un created_by pointe vers un profile qui n'existe
--   plus, la ligne reste NULL.
-- - `updated_at = NOW()` : on marque le backfill dans l'historique.
--   Impact mineur : le tri "Dernière modification" remontera ces lignes
--   au jour J. Acceptable vu le bénéfice.
--
-- Non-réversible automatiquement (mais loggable) : pour un rollback, exécuter
-- avant le backfill :
--   CREATE TABLE crm_tasks_backup_h20 AS SELECT * FROM crm_tasks WHERE assigned_to IS NULL;
-- Puis pour rollback : UPDATE crm_tasks SET assigned_to = NULL WHERE id IN (SELECT id FROM crm_tasks_backup_h20);
--
-- À EXÉCUTER DANS LE SUPABASE DASHBOARD SQL EDITOR.
-- ============================================================

-- ============================================================
-- Étape 1 — DRY RUN : compter avant pour vérifier l'ampleur
-- ============================================================
-- Lance d'abord cette query seule, vérifie que le nombre matche tes attentes
-- (~418 actives + ~1000 completed = ~1418 max), puis lance le UPDATE en
-- étape 2.

SELECT
  COUNT(*) AS rows_to_backfill,
  COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) AS active_to_backfill,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_to_backfill,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_to_backfill
FROM crm_tasks ct
WHERE ct.assigned_to IS NULL
  AND ct.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = ct.created_by);

-- ============================================================
-- Étape 2 — BACKFILL (à lancer après vérification de l'étape 1)
-- ============================================================

UPDATE crm_tasks AS ct
SET
  assigned_to = ct.created_by,
  updated_at = NOW()
WHERE ct.assigned_to IS NULL
  AND ct.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = ct.created_by);

-- ============================================================
-- Étape 3 — VÉRIFICATION POST-BACKFILL
-- ============================================================

-- 3a : combien de lignes restent NULL (devrait approcher 0,
--      sauf vieilles tâches sans created_by ou avec créateur supprimé)
SELECT
  COUNT(*) AS still_null_after_backfill,
  COUNT(*) FILTER (WHERE created_by IS NULL) AS null_because_no_creator,
  COUNT(*) FILTER (WHERE created_by IS NOT NULL) AS null_because_creator_missing
FROM crm_tasks
WHERE assigned_to IS NULL;

-- 3b : distribution finale par propriétaire (active only) — devrait
--      correspondre à ce que tu vois dans le dropdown du CRM Tâches
SELECT
  COALESCE(p.first_name || ' ' || p.last_name, p.email, 'NULL') AS owner,
  p.role,
  COUNT(*) AS count
FROM crm_tasks ct
LEFT JOIN profiles p ON p.id = ct.assigned_to
WHERE ct.status IN ('pending', 'in_progress')
GROUP BY p.id, p.first_name, p.last_name, p.email, p.role
ORDER BY count DESC NULLS LAST;
