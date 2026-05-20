-- ============================================================
-- DIAGNOSTIC — Complétion CRM (prospects manquants + tâches mal reliées)
-- ============================================================
-- READ-ONLY : aucune écriture. À lancer dans Supabase SQL Editor.
--
-- ⚠️ Le SQL Editor n'affiche que le résultat de la DERNIÈRE requête.
--    Lance chaque bloc SÉPARÉMENT : sélectionne les lignes du bloc puis Run.
--
-- Objectif : caractériser l'état actuel avant de lancer 04a / 04b et de
-- décider de la stratégie de re-liaison des tâches.
-- ============================================================


-- ── BLOC 1 — Prospects : champs manquants par entité ──────────────────────
-- Combien de prospects, et combien ont chaque champ vide.
SELECT
  e.slug AS entite,
  COUNT(*)                                                  AS prospects_total,
  COUNT(*) FILTER (WHERE p.sellsy_id    IS NULL)             AS sans_sellsy_id,
  COUNT(*) FILTER (WHERE p.contact_name IS NULL)             AS sans_contact_name,
  COUNT(*) FILTER (WHERE p.email        IS NULL)             AS sans_email,
  COUNT(*) FILTER (WHERE p.phone        IS NULL)             AS sans_phone,
  COUNT(*) FILTER (WHERE p.siret        IS NULL)             AS sans_siret,
  COUNT(*) FILTER (WHERE p.address      IS NULL)             AS sans_adresse,
  COUNT(*) FILTER (WHERE p.city         IS NULL)             AS sans_ville
FROM crm_prospects p
JOIN entities e ON e.id = p.entity_id
GROUP BY e.slug
ORDER BY e.slug;


-- ── BLOC 2 — Tâches : volumétrie et liaison aux prospects ─────────────────
-- prospect_id NULL = tâche non reliée. Comparer reliees / non_reliees.
SELECT
  e.slug AS entite,
  COUNT(*)                                                  AS taches_total,
  COUNT(*) FILTER (WHERE t.prospect_id IS NOT NULL)          AS taches_reliees,
  COUNT(*) FILTER (WHERE t.prospect_id IS NULL)              AS taches_non_reliees,
  COUNT(*) FILTER (WHERE t.client_id   IS NOT NULL)          AS taches_avec_client,
  COUNT(*) FILTER (WHERE t.sellsy_external_ref IS NOT NULL)  AS taches_origine_sellsy
FROM crm_tasks t
JOIN entities e ON e.id = t.entity_id
GROUP BY e.slug
ORDER BY e.slug;


-- ── BLOC 3 — Tâches Sellsy non reliées : échantillon ──────────────────────
-- Pour comprendre POURQUOI elles ne sont pas reliées (le titre/description
-- aide à voir si la société existe en base sous un autre sellsy_id).
SELECT t.id, t.title, t.label, t.due_date, t.contact_email,
       LEFT(t.description, 80) AS description_debut
FROM crm_tasks t
WHERE t.prospect_id IS NULL
  AND t.sellsy_external_ref IS NOT NULL
ORDER BY t.created_at DESC
LIMIT 30;


-- ── BLOC 4 — Tâches reliées : cohérence du rattachement ───────────────────
-- Vérifie si l'email de contact de la tâche correspond à l'email du prospect
-- relié. Une divergence massive = tâches reliées au MAUVAIS prospect.
SELECT
  COUNT(*)                                                          AS taches_reliees_avec_email,
  COUNT(*) FILTER (WHERE lower(t.contact_email) = lower(p.email))    AS email_coherent,
  COUNT(*) FILTER (WHERE lower(t.contact_email) <> lower(p.email))   AS email_divergent
FROM crm_tasks t
JOIN crm_prospects p ON p.id = t.prospect_id
WHERE t.contact_email IS NOT NULL
  AND p.email IS NOT NULL;


-- ── BLOC 5 — Échantillon de tâches reliées à email divergent ──────────────
-- Si BLOC 4 montre beaucoup de divergences, ce bloc montre des exemples
-- concrets de mauvais rattachement.
SELECT t.id AS task_id, t.title, t.contact_email AS email_tache,
       p.company_name AS prospect_relie, p.email AS email_prospect,
       p.sellsy_id
FROM crm_tasks t
JOIN crm_prospects p ON p.id = t.prospect_id
WHERE t.contact_email IS NOT NULL
  AND p.email IS NOT NULL
  AND lower(t.contact_email) <> lower(p.email)
ORDER BY t.created_at DESC
LIMIT 30;


-- ── BLOC 6 — Doublons de sellsy_id (ne devrait jamais arriver) ────────────
-- La contrainte UNIQUE (sellsy_id, entity_id) l'interdit, mais on vérifie.
SELECT sellsy_id, COUNT(*) AS nb
FROM crm_prospects
WHERE sellsy_id IS NOT NULL
GROUP BY sellsy_id
HAVING COUNT(*) > 1;
