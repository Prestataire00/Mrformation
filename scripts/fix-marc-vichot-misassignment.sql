-- ============================================================
-- FIX prod : 1259 prospects MR "MARC VICHOT" mal assignés à Loris
-- ============================================================
-- Cause : le fallback `LOWER(last_name) = 'VICHOT'` dans owner_subquery
-- du script Python remontait le profile de Loris VICHOT pour les prospects
-- dont le Propriétaire Sellsy était "MARC VICHOT" (puisqu'il n'a pas de
-- profile en base). Le script a été corrigé (commit suivant : match strict
-- sur full name), mais les 1259 prospects déjà importés gardent l'assignation
-- erronée.
--
-- Cette requête nettoie : pour tout prospect MR dont notes contient
-- "Propriétaire Sellsy : MARC VICHOT" et qui pointe actuellement vers Loris
-- (le seul profile VICHOT en base), on remet assigned_to à NULL. Le nom
-- "MARC VICHOT" reste préservé dans notes — quand Marc aura un profile,
-- relancer 01_a..01_l corrigera automatiquement via ON CONFLICT DO UPDATE.
--
-- À exécuter dans Supabase SQL Editor (Cmd+A → Run).
-- ============================================================

BEGIN;

-- Avant :
SELECT
  COUNT(*) AS prospects_marc_mal_assignes
FROM crm_prospects p
WHERE p.source = 'sellsy_import'
  AND p.entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND p.notes LIKE 'Propriétaire Sellsy : MARC VICHOT%'
  AND p.assigned_to = (
    SELECT id FROM profiles
    WHERE LOWER(first_name || ' ' || last_name) = 'loris vichot'
    LIMIT 1
  );
-- Attendu : 1259

UPDATE crm_prospects p
SET assigned_to = NULL, updated_at = NOW()
WHERE p.source = 'sellsy_import'
  AND p.entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND p.notes LIKE 'Propriétaire Sellsy : MARC VICHOT%'
  AND p.assigned_to = (
    SELECT id FROM profiles
    WHERE LOWER(first_name || ' ' || last_name) = 'loris vichot'
    LIMIT 1
  );

-- Après — vérification :
SELECT
  (SELECT COUNT(*) FROM crm_prospects
     WHERE source = 'sellsy_import' AND assigned_to IS NOT NULL) AS total_prospects_avec_owner,
  (SELECT COUNT(*) FROM crm_prospects
     WHERE source = 'sellsy_import' AND assigned_to IS NULL) AS total_prospects_sans_owner,
  (SELECT COUNT(*) FROM crm_prospects
     WHERE assigned_to = (SELECT id FROM profiles WHERE LOWER(first_name || ' ' || last_name) = 'loris vichot' LIMIT 1)
       AND source = 'sellsy_import') AS prospects_loris_apres_fix;
-- Attendu après fix :
--   total_prospects_avec_owner ≈ 1331 (Loris C3V uniquement)
--   total_prospects_sans_owner ≈ 3149 (tout le reste : Marc MR + Taline MR + Lola MR + Alexandre C3V + Florence C3V)
--   prospects_loris_apres_fix ≈ 1331

COMMIT;
