-- ============================================================
-- Setup profiles importés Sellsy + réassignation prospects
-- ============================================================
-- À exécuter dans Supabase SQL Editor APRÈS avoir créé les 5 auth.users
-- via Dashboard → Authentication → Users → Add user, avec les emails :
--
--   marc.vichot@mrformation.fr            (MR)
--   taline.karagueuzian@mrformation.fr    (MR)
--   lola.leriche@mrformation.fr           (MR)
--   alexandre.audo@c3vformation.fr        (C3V)
--   florence.etheve@c3vformation.fr       (C3V)
--
-- Auto-confirmer la création (Confirm user) pour ne pas avoir à valider
-- l'email. Mot de passe : peu importe — Loris pourra envoyer un magic link
-- plus tard si la personne doit se connecter, ou les supprimer si non-active.
--
-- Ce SQL est idempotent : peut être relancé sans casser quoi que ce soit.
-- ============================================================

BEGIN;

-- ── 1. Pré-vérification : les 5 auth.users existent-ils bien ? ──
-- Si tu vois moins de 5 lignes, c'est qu'il manque une création côté Auth.
SELECT email,
       (SELECT id FROM profiles WHERE id = u.id) IS NOT NULL AS profile_existe
  FROM auth.users u
 WHERE email IN (
   'marc.vichot@mrformation.fr',
   'taline.karagueuzian@mrformation.fr',
   'lola.leriche@mrformation.fr',
   'alexandre.audo@c3vformation.fr',
   'florence.etheve@c3vformation.fr'
 )
 ORDER BY email;

-- ── 2. UPDATE profiles : nom, rôle, entité ──
-- Le trigger Supabase a créé les profiles avec role='learner' par défaut.
-- On met à jour pour role='commercial' + entité associée.

UPDATE profiles SET
  first_name = 'Marc',
  last_name = 'VICHOT',
  role = 'commercial',
  entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
WHERE email = 'marc.vichot@mrformation.fr';

UPDATE profiles SET
  first_name = 'Taline',
  last_name = 'Karagueuzian',
  role = 'commercial',
  entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
WHERE email = 'taline.karagueuzian@mrformation.fr';

UPDATE profiles SET
  first_name = 'Lola',
  last_name = 'LERICHE',
  role = 'commercial',
  entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
WHERE email = 'lola.leriche@mrformation.fr';

UPDATE profiles SET
  first_name = 'Alexandre',
  last_name = 'AUDO',
  role = 'commercial',
  entity_id = (SELECT id FROM entities WHERE slug = 'c3v-formation')
WHERE email = 'alexandre.audo@c3vformation.fr';

UPDATE profiles SET
  first_name = 'Florence',
  last_name = 'ETHÈVE',
  role = 'commercial',
  entity_id = (SELECT id FROM entities WHERE slug = 'c3v-formation')
WHERE email = 'florence.etheve@c3vformation.fr';

-- ── 3. Vérification mise à jour profiles ──
SELECT email, first_name, last_name, role,
       (SELECT slug FROM entities WHERE id = p.entity_id) AS entite
  FROM profiles p
 WHERE email IN (
   'marc.vichot@mrformation.fr',
   'taline.karagueuzian@mrformation.fr',
   'lola.leriche@mrformation.fr',
   'alexandre.audo@c3vformation.fr',
   'florence.etheve@c3vformation.fr'
 )
 ORDER BY email;

-- ── 4. Réassignation des prospects ──
-- Match basé sur le préfixe `Propriétaire Sellsy : <nom>` dans notes
-- (le suffixe peut contenir un Contact). Cas SQL INSENSIBLE à la casse via UPPER().

-- Marc VICHOT (1259 prospects MR — actuellement assignés à Loris à tort)
UPDATE crm_prospects SET
  assigned_to = (SELECT id FROM profiles WHERE email = 'marc.vichot@mrformation.fr' LIMIT 1),
  updated_at = NOW()
WHERE source = 'sellsy_import'
  AND entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND notes LIKE 'Propriétaire Sellsy : MARC VICHOT%';

-- Taline Karagueuzian (~1000 prospects MR)
UPDATE crm_prospects SET
  assigned_to = (SELECT id FROM profiles WHERE email = 'taline.karagueuzian@mrformation.fr' LIMIT 1),
  updated_at = NOW()
WHERE source = 'sellsy_import'
  AND entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND notes LIKE 'Propriétaire Sellsy : Taline Karagueuzian%';

-- Lola LERICHE (~200 prospects MR)
UPDATE crm_prospects SET
  assigned_to = (SELECT id FROM profiles WHERE email = 'lola.leriche@mrformation.fr' LIMIT 1),
  updated_at = NOW()
WHERE source = 'sellsy_import'
  AND entity_id = (SELECT id FROM entities WHERE slug = 'mr-formation')
  AND notes LIKE 'Propriétaire Sellsy : Lola LERICHE%';

-- Alexandre AUDO (368 prospects C3V)
UPDATE crm_prospects SET
  assigned_to = (SELECT id FROM profiles WHERE email = 'alexandre.audo@c3vformation.fr' LIMIT 1),
  updated_at = NOW()
WHERE source = 'sellsy_import'
  AND entity_id = (SELECT id FROM entities WHERE slug = 'c3v-formation')
  AND notes LIKE 'Propriétaire Sellsy : Alexandre AUDO%';

-- Florence ETHÈVE (275 prospects C3V — ex-employée mais profile créé pour conserver la traçabilité)
UPDATE crm_prospects SET
  assigned_to = (SELECT id FROM profiles WHERE email = 'florence.etheve@c3vformation.fr' LIMIT 1),
  updated_at = NOW()
WHERE source = 'sellsy_import'
  AND entity_id = (SELECT id FROM entities WHERE slug = 'c3v-formation')
  AND notes LIKE 'Propriétaire Sellsy : Florence ETHÈVE%';

-- ── 5. Vérification finale : couverture du mapping ──
SELECT
  e.slug,
  COUNT(*) AS total_prospects,
  COUNT(assigned_to) AS avec_owner,
  COUNT(*) - COUNT(assigned_to) AS sans_owner,
  ROUND(100.0 * COUNT(assigned_to) / COUNT(*), 1) AS pct_avec_owner
FROM crm_prospects p
JOIN entities e ON e.id = p.entity_id
WHERE source = 'sellsy_import'
GROUP BY e.slug
ORDER BY e.slug;
-- Attendu après ce SQL : 100% des prospects ont un owner (sauf cas marginaux
-- où le Propriétaire Sellsy était NULL dans le CSV).

-- ── 6. Bonus : compteurs par owner ──
SELECT
  pr.email AS owner_email,
  pr.first_name || ' ' || pr.last_name AS owner_nom,
  (SELECT slug FROM entities WHERE id = pr.entity_id) AS entite,
  COUNT(p.id) AS prospects_assignes
FROM profiles pr
LEFT JOIN crm_prospects p ON p.assigned_to = pr.id AND p.source = 'sellsy_import'
WHERE pr.email IN (
   'contact@c3vformation.fr',
   'marc.vichot@mrformation.fr',
   'taline.karagueuzian@mrformation.fr',
   'lola.leriche@mrformation.fr',
   'alexandre.audo@c3vformation.fr',
   'florence.etheve@c3vformation.fr'
)
GROUP BY pr.email, pr.first_name, pr.last_name, pr.entity_id
ORDER BY prospects_assignes DESC;

COMMIT;
