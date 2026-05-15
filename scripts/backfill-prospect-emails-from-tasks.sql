-- ============================================================
-- 04 — Back-fill des emails de prospects depuis leurs tâches
-- ============================================================
-- BONUS : enrichit les prospects qui n'ont pas d'email en base avec
-- l'email trouvé dans leur tâche la plus récente (si dispo).
--
-- Stratégie :
--   - Pour chaque prospect SANS email,
--   - On regarde toutes les tâches liées à ce prospect qui ont un contact_email,
--   - On prend la plus récente (par created_at) et on copie son email.
--
-- À exécuter APRÈS avoir re-run les 5 fichiers 03_*_import_tasks.sql
-- (qui populent maintenant `contact_email` sur les tâches).
--
-- Idempotent : on ne modifie que les prospects dont l'email est NULL ou vide.
-- Si tu relances, ça ne change rien aux emails déjà existants.
-- ============================================================

BEGIN;

-- Compte avant :
SELECT
  (SELECT COUNT(*) FROM crm_prospects
     WHERE source = 'sellsy_import' AND (email IS NULL OR email = '')) AS prospects_sans_email_avant,
  (SELECT COUNT(DISTINCT prospect_id) FROM crm_tasks
     WHERE contact_email IS NOT NULL AND prospect_id IS NOT NULL) AS prospects_enrichissables;

-- Back-fill : pour chaque prospect sans email, on prend l'email de sa tâche la plus récente.
WITH best_email_per_prospect AS (
  SELECT DISTINCT ON (t.prospect_id)
    t.prospect_id,
    t.contact_email
  FROM crm_tasks t
  WHERE t.contact_email IS NOT NULL
    AND t.contact_email <> ''
    AND t.prospect_id IS NOT NULL
  ORDER BY t.prospect_id, t.created_at DESC
)
UPDATE crm_prospects p
SET email = b.contact_email,
    updated_at = NOW()
FROM best_email_per_prospect b
WHERE p.id = b.prospect_id
  AND (p.email IS NULL OR p.email = '');

-- Compte après :
SELECT
  (SELECT COUNT(*) FROM crm_prospects
     WHERE source = 'sellsy_import' AND (email IS NULL OR email = '')) AS prospects_sans_email_apres,
  (SELECT COUNT(*) FROM crm_prospects
     WHERE source = 'sellsy_import' AND email IS NOT NULL AND email <> '') AS prospects_avec_email_apres;

COMMIT;

-- ============================================================
-- Vérification spot-check :
--   SELECT p.company_name, p.email, t.contact_email, t.created_at
--   FROM crm_prospects p
--   JOIN crm_tasks t ON t.prospect_id = p.id
--   WHERE p.source = 'sellsy_import'
--   ORDER BY t.created_at DESC LIMIT 10;
-- ============================================================
