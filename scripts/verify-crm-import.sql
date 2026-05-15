-- ============================================================
-- Vérification post-import CRM Sellsy — à exécuter dans Supabase SQL Editor
-- ============================================================
-- Lance bloc par bloc (chacun est indépendant). Vérifie les compteurs vs
-- attendus, l'isolation multi-tenant, l'intégrité référentielle, et
-- la complétude des données.
-- ============================================================

-- ── 1. Compteurs globaux par entité (attendu : MR 2506+1924 / C3V 1974+~120) ──
SELECT
  e.slug,
  (SELECT COUNT(*) FROM crm_prospects         WHERE entity_id = e.id) AS prospects,
  (SELECT COUNT(*) FROM crm_tasks             WHERE entity_id = e.id) AS tasks,
  (SELECT COUNT(*) FROM crm_prospect_comments WHERE entity_id = e.id) AS comments
FROM entities e
WHERE e.slug IN ('mr-formation', 'c3v-formation')
ORDER BY e.slug;
-- Attendu :
--   c3v-formation : prospects=1974, tasks=0,    comments≈120
--   mr-formation  : prospects=2506, tasks=1924, comments≈2187

-- ── 2. Isolation cross-entity : aucun lien ne doit traverser les entités ──
SELECT
  'tasks dont prospect_id est dans une autre entité' AS check_name,
  COUNT(*) AS violations
FROM crm_tasks t
JOIN crm_prospects p ON p.id = t.prospect_id
WHERE t.entity_id <> p.entity_id
UNION ALL
SELECT
  'comments dont prospect_id est dans une autre entité',
  COUNT(*)
FROM crm_prospect_comments c
JOIN crm_prospects p ON p.id = c.prospect_id
WHERE c.entity_id <> p.entity_id;
-- Attendu : 0 violations partout

-- ── 3. Couverture du mapping owner → assigned_to (qui a été mappé en DB) ──
SELECT
  e.slug,
  COUNT(*) AS total_prospects,
  COUNT(assigned_to) AS avec_proprietaire_db,
  COUNT(*) - COUNT(assigned_to) AS sans_proprietaire_db
FROM crm_prospects p
JOIN entities e ON e.id = p.entity_id
WHERE source = 'sellsy_import'
GROUP BY e.slug
ORDER BY e.slug;
-- Si "sans_proprietaire_db" est élevé, c'est que certains noms Sellsy n'ont pas de
-- profile correspondant en base. Le nom reste dans `notes` (cf. requête #11).

-- ── 4. Validité des status sur les tâches (CHECK constraint) ──
SELECT status, COUNT(*) AS n
FROM crm_tasks
WHERE entity_id IN (SELECT id FROM entities WHERE slug IN ('mr-formation', 'c3v-formation'))
GROUP BY status
ORDER BY n DESC;
-- Attendu : completed≈1507, pending≈417 (pas d'autre valeur)

-- ── 5. Distribution des due_date des tâches (range historique) ──
SELECT
  EXTRACT(YEAR FROM due_date) AS year,
  status,
  COUNT(*) AS n
FROM crm_tasks
WHERE entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND due_date IS NOT NULL
GROUP BY year, status
ORDER BY year, status;
-- Attendu : 2023=106, 2024=17, 2025=729, 2026=1066, 2027=6 (réparties pending/completed)

-- ── 6. Orphelins : tâches sans prospect lié ──
SELECT
  COUNT(*) AS total_tasks,
  COUNT(prospect_id) AS avec_prospect,
  COUNT(*) - COUNT(prospect_id) AS orphelines,
  ROUND(100.0 * (COUNT(*) - COUNT(prospect_id)) / COUNT(*), 1) AS pct_orphelines
FROM crm_tasks
WHERE entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation');
-- Attendu : ~66 orphelines sur 1924 (~3.4%) — prospects supprimés côté Sellsy ou ID OBJET LIE manquant

-- ── 7. Orphelins : commentaires (devraient avoir été cleanup par DELETE prospect_id IS NULL) ──
SELECT COUNT(*) AS comments_orphelins
FROM crm_prospect_comments
WHERE prospect_id IS NULL;
-- Attendu : 0 (cleanup automatique)

-- ── 8. Contact emails : combien de tâches en ont après le re-run ? ──
SELECT
  COUNT(*) AS total_tasks,
  COUNT(contact_email) AS avec_contact_email,
  ROUND(100.0 * COUNT(contact_email) / COUNT(*), 1) AS pct_avec_email
FROM crm_tasks
WHERE entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation');

-- ── 9. Emails prospects après le back-fill ──
SELECT
  e.slug,
  COUNT(*) AS total,
  COUNT(NULLIF(p.email, '')) AS avec_email,
  ROUND(100.0 * COUNT(NULLIF(p.email, '')) / COUNT(*), 1) AS pct_avec_email
FROM crm_prospects p
JOIN entities e ON e.id = p.entity_id
WHERE source = 'sellsy_import'
GROUP BY e.slug
ORDER BY e.slug;

-- ── 10. Distribution des labels de tâches (4 attendus) ──
SELECT label, COUNT(*) AS n
FROM crm_tasks
WHERE entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND label IS NOT NULL
GROUP BY label
ORDER BY n DESC;
-- Attendu : Rappel=1230, Relance par téléphone/mail=660, Appel téléphonique=24, Rendez-vous=10

-- ── 11. Prospects sans assigned_to : qui sont-ils dans le CSV ? ──
SELECT
  e.slug,
  notes,
  COUNT(*) AS n
FROM crm_prospects p
JOIN entities e ON e.id = p.entity_id
WHERE source = 'sellsy_import'
  AND assigned_to IS NULL
GROUP BY e.slug, notes
ORDER BY n DESC
LIMIT 20;
-- Affiche le "Propriétaire Sellsy" qui n'a pas de profile en base.
-- Permet de créer manuellement les profiles manquants pour ces 6 noms si besoin.

-- ── 12. Sanité : SIREN dans le champ siret (9 chiffres) ──
SELECT
  COUNT(*) AS total_avec_siret,
  COUNT(*) FILTER (WHERE LENGTH(siret) = 9) AS siret_9_chiffres,
  COUNT(*) FILTER (WHERE LENGTH(siret) <> 9) AS siret_autre_longueur,
  COUNT(*) FILTER (WHERE siret !~ '^[0-9]+$') AS siret_non_numerique
FROM crm_prospects
WHERE source = 'sellsy_import' AND siret IS NOT NULL;
-- Attendu : ~3624 SIREN de 9 chiffres numériques (4480 - 856 sans SIREN)

-- ── 13. Spot-check : 5 prospects MR récents pour validation visuelle ──
SELECT
  company_name,
  siret,
  city,
  email,
  phone,
  naf_code,
  (SELECT email FROM profiles WHERE id = p.assigned_to) AS owner_email
FROM crm_prospects p
WHERE entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND source = 'sellsy_import'
ORDER BY created_at DESC
LIMIT 5;
