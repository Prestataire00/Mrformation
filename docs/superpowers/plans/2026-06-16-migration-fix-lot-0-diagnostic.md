# Correction migration espace formation — Lot 0 : Diagnostic — Plan

> **For agentic workers:** Lot **lecture seule** (diagnostic). Pas de code applicatif, pas de TDD : des requêtes SQL `SELECT` à exécuter dans Supabase Dashboard pour chiffrer l'ampleur des trous AVANT toute écriture (Lots 1 & 2). Étapes en checkbox.

**Goal:** Quantifier précisément les 3 trous (apprenants sans entreprise, sessions sans créneaux, sort des 949 enrollments « skipped ») pour dimensionner et orienter les Lots 1 & 2.

**Architecture:** Data-ops read-only. Un fichier SQL de diagnostic, exécuté par l'admin dans Supabase Dashboard → SQL Editor. Aucune écriture. Sert aussi de mesure « avant » (à rejouer « après » pour valider).

**Tech Stack:** Postgres / Supabase SQL Editor.

**Référence cadrage :** `bmad_output/planning-artifacts/2026-06-16-cadrage-correction-migration-espace-formation.md` (Lot 0).

---

## File Structure
| Fichier | Rôle | Action |
|---------|------|--------|
| `scripts/import-loris/diagnostic-migration-fix.sql` | Requêtes de diagnostic read-only (commentées) | Créer |

---

## Task 1 : Écrire le SQL de diagnostic

**Files:** Create `scripts/import-loris/diagnostic-migration-fix.sql`

- [ ] **Step 1 : Créer le fichier avec ces requêtes**

```sql
-- ============================================================
-- Diagnostic — Correction migration espace formation (Lot 0)
-- LECTURE SEULE. À exécuter dans Supabase Dashboard → SQL Editor.
-- Chiffre les 3 trous + sert de mesure "avant".
-- (Remplacer :ENTITY si on veut scoper une entité ; sinon ventilation par entité.)
-- ============================================================

-- 1A. Apprenants sans entreprise, ventilés par entité
SELECT e.slug AS entite,
       count(*)                                   AS learners_total,
       count(*) FILTER (WHERE l.client_id IS NULL) AS sans_client_id,
       count(*) FILTER (WHERE l.client_id IS NULL
                          AND l.metadata->>'_unmatched_entreprise' IS NOT NULL) AS sans_client_mais_entreprise_connue
FROM learners l
JOIN entities e ON e.id = l.entity_id
GROUP BY e.slug
ORDER BY e.slug;

-- 1B. Top des noms d'entreprise non matchés (cible du Lot 1)
SELECT lower(btrim(l.metadata->>'_unmatched_entreprise')) AS entreprise_non_matchee,
       count(*) AS nb_apprenants
FROM learners l
WHERE l.client_id IS NULL
  AND l.metadata->>'_unmatched_entreprise' IS NOT NULL
GROUP BY 1
ORDER BY nb_apprenants DESC
LIMIT 50;

-- 1C. Combien de ces noms matchent UN SEUL client existant (non ambigu = réparable auto)
WITH unmatched AS (
  SELECT DISTINCT l.entity_id, lower(btrim(l.metadata->>'_unmatched_entreprise')) AS nom
  FROM learners l
  WHERE l.client_id IS NULL AND l.metadata->>'_unmatched_entreprise' IS NOT NULL
)
SELECT
  count(*) FILTER (WHERE c.n = 1) AS reparable_auto_1_match,
  count(*) FILTER (WHERE c.n > 1) AS ambigu_plusieurs_matchs,
  count(*) FILTER (WHERE c.n = 0 OR c.n IS NULL) AS aucun_match
FROM unmatched u
LEFT JOIN LATERAL (
  SELECT count(*) AS n
  FROM clients cl
  WHERE cl.entity_id = u.entity_id
    AND lower(btrim(cl.company_name)) = u.nom
) c ON true;

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

-- 2B. Parmi les sessions sans créneaux : combien ont les infos nécessaires (dates + heures) pour la synthèse
SELECT
  count(*) AS sans_creneaux,
  count(*) FILTER (WHERE s.start_date IS NOT NULL AND s.end_date IS NOT NULL
                     AND COALESCE(s.planned_hours,0) > 0) AS synthetisables,
  count(*) FILTER (WHERE s.start_date IS NULL OR s.end_date IS NULL
                     OR COALESCE(s.planned_hours,0) = 0) AS non_synthetisables
FROM sessions s
WHERE NOT EXISTS (SELECT 1 FROM formation_time_slots fts WHERE fts.session_id = s.id);

-- 3A. Enrollments : doublons réels vs distincts (les 949 "skipped")
--     Un (session_id, learner_id) en double = vrai doublon. Sinon distinct.
SELECT
  count(*)                                        AS enrollments_total,
  count(*) FILTER (WHERE l.client_id IS NULL)      AS enrollments_sans_client_id
FROM enrollments en
JOIN learners l ON l.id = en.learner_id;

-- 3B. Y a-t-il des apprenants présents en source (stagiaires) mais SANS enrollment en base ?
--     (À recouper avec stagiaires.csv côté script — ici on mesure les enrollments existants.)
SELECT s.id AS session_id, s.title, count(en.id) AS nb_inscrits
FROM sessions s
LEFT JOIN enrollments en ON en.session_id = s.id
GROUP BY s.id, s.title
HAVING count(en.id) = 0
ORDER BY s.start_date DESC
LIMIT 50;
```

- [ ] **Step 2 : Exécuter dans Supabase Dashboard → SQL Editor** (chaque bloc), et **noter les résultats** (ils dimensionnent les Lots 1 & 2 et serviront de mesure « avant »).

- [ ] **Step 3 : Commit du fichier de diagnostic**

```bash
git add scripts/import-loris/diagnostic-migration-fix.sql
git commit -m "chore(migration): SQL de diagnostic espace formation (Lot 0, read-only)"
```

---

## Task 2 : Interpréter & décider la suite

- [ ] **Step 1 : Reporter les chiffres** dans le cadrage (ou ici) : `sans_client_id`, `reparable_auto_1_match` vs `ambigu`/`aucun_match` (1C), `sessions_sans_creneaux` + `synthetisables` (2B), enrollments orphelins (3B).
- [ ] **Step 2 : Trancher les points ouverts du cadrage §5** à la lumière des chiffres :
  - Le ratio `reparable_auto` vs `ambigu` confirme la faisabilité du Lot 1 automatique.
  - `non_synthetisables` (2B) = sessions à traiter manuellement (pas de dates/heures).
  - Les sessions à 0 inscrit (3B) = piste sur les 949 « skipped ».
- [ ] **Step 3 :** Selon les chiffres, lancer le plan **Lot 1** (rattachement entreprises) puis **Lot 2** (créneaux).

---

## Notes
- 100 % `SELECT` : aucune écriture, aucun risque. Ré-exécutable.
- Requêtes scopées/ventilées par `entity_id` (isolation multi-tenant).
- `learners.metadata->>'_unmatched_entreprise'` : marqueur posé par `loris_import.py:287` pour les entreprises non résolues — c'est la cible directe du Lot 1.
