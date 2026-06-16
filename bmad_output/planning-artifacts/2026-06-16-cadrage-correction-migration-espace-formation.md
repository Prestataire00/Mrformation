# Cadrage — Correction de la migration de données (espace formation)

**Auteur :** Mary (Business Analyst, BMad)
**Date :** 2026-06-16
**Statut :** Cadrage validé — v1.0 (design approuvé)
**Demandeur :** Ismael / Wissam (suite plainte client : données mal complétées dans l'espace formation)

---

## 0. Résumé exécutif

Le client constate, dans l'espace formation, deux trous laissés par la migration initiale (`scripts/import-loris/loris_import.py`, exécutée le 2026-06-08) :
1. **Apprenants non reliés à leur entreprise** (`learners.client_id` / `enrollments.client_id` à NULL).
2. **Plannings sans créneaux** (`formation_time_slots` jamais créés).

**Cause racine vérifiée** :
- `map_learner` (`loris_import.py:256-296`) résout `client_id` par **nom d'entreprise normalisé** ; en cas d'échec → `client_id = None` et le nom est stocké dans `metadata._unmatched_entreprise`. C'est le **piège connu du matching par nom** (cf. import Sellsy : doublons/variantes de noms).
- `loris_import.py` **n'importe pas** `formation_time_slots` (absent de sa liste de tables). La source `Suivi de l'activité.xlsx` ne contient que **dates début/fin + heures prévues**, **pas** de créneaux horaires détaillés.
- Le rapport (`last_import_report.json`) montre **949 enrollments « skipped duplicates »** sur 1089 (140 insérés) → à investiguer (inscriptions légitimes ratées ?).

**Stratégie** : réconciliation **dry-run-first** (rapports avant toute écriture), idempotente, par clé composite **nom normalisé + contexte** avec garde-fou anti-ambiguïté. Données source : `stagiaires.csv` (colonne `Entreprise`), `Suivi de l'activité.xlsx` (dates/heures).

---

## 1. Décisions de cadrage (validées)

| # | Question | Décision |
|---|----------|----------|
| D1 | Clé de rapprochement | **Nom normalisé + contexte** (entreprise, dates), garde-fou « un seul match » (anti-ambiguïté). |
| D2 | Créneaux horaires (inexistants en source) | **Synthétiser** depuis plage de dates + heures prévues (demi-journées sur jours ouvrés). Planning « estimé », ajustable en UI. |
| D3 | Exécution | **Data-ops** : scripts/SQL en **dry-run d'abord** (rapports), puis application sélective jouée par l'admin (comme les autres migrations). |

---

## 2. Lots

### Lot 0 — Diagnostic (lecture seule, dry-run)
Quantifier avant d'agir (et mesurer après) :
- `learners` avec `client_id IS NULL` (et combien ont `metadata->>'_unmatched_entreprise'` renseigné).
- `sessions` sans aucune ligne `formation_time_slots`.
- Les **949 enrollments « skipped duplicates »** : étaient-ce de vrais doublons, ou des inscriptions distinctes ratées (ex. même apprenant sur 2 sessions, ratées par une clé de dédup trop large) ?
Livrable : un rapport chiffré (SQL de diagnostic) qui dimensionne chaque trou.

### Lot 1 — Rattachement apprenants ↔ entreprises
- **Source** : `stagiaires.csv` (colonnes `Prénom, Nom, Email, Entreprise`). ⚠️ Correction post-diagnostic : `learners` n'a **pas** de colonne `metadata` → le marqueur `_unmatched_entreprise` de `loris_import.py` n'a jamais été persisté. Le rapprochement se fait donc **entièrement depuis `stagiaires.csv`** (matcher chaque ligne à un `learners` par `Prénom+Nom`(+`Email`), puis son `Entreprise` à un `clients`).
- **Matching** :
  - apprenant : `Prénom+Nom` normalisés (idéalement recoupé `Email` si présent) → `learners`.
  - entreprise : `norm_name(Entreprise)` → `clients` (lower / btrim / sans accents), avec **`HAVING COUNT(DISTINCT client) = 1`** (ne lier que si non ambigu).
- **Sortie dry-run** : `matché / ambigu / non-matché` (CSV de revue).
- **Application** : pour les non-ambigus, set `learners.client_id` puis cascade `enrollments.client_id` (pour les inscriptions où il est NULL). Idempotent (ne ré-écrit pas un client_id déjà correct). Les ambigus/non-matchés → liste pour rattachement manuel UI.

### Lot 2 — Synthèse des créneaux (`formation_time_slots`)
- Pour chaque session **sans créneaux** : répartir `planned_hours` (heures prévues) en **demi-journées** (par défaut 9h00-12h30 / 13h30-17h00, ~3,5 h chacune) sur les **jours ouvrés** entre `start_date` et `end_date` (exclure week-ends/fériés — réutiliser `src/lib/utils/french-holidays.ts`, `slot-overlap.ts`, et le pattern `BulkSlotCreator`).
- Insérer les `formation_time_slots` (idempotent : skip si la session en a déjà). Marquer le planning comme « estimé » (note/flag) pour signaler à l'admin qu'il peut l'ajuster.
- ⚠️ Le trigger `trg_recompute_planned_hours` recalcule `sessions.planned_hours` depuis les slots — vérifier la cohérence (les heures synthétisées doivent retomber sur les heures prévues d'origine).

---

## 3. Sécurité & garanties
- **Dry-run obligatoire** avant toute écriture (le 1er import s'est trompé → on vérifie d'abord).
- **Idempotent** : ré-exécutable sans créer de doublons (skip si déjà correct/présent).
- **Isolation `entity_id`** : chaque rapprochement borné à l'entité de l'apprenant/session.
- **Garde-fou anti-ambiguïté** sur tout matching par nom (un seul candidat, sinon « ambigu » → manuel).
- **Réversibilité** : les écritures (client_id, slots) sont additives/correctives ; consigner les lignes modifiées (rapport d'application) pour audit.

---

## 4. Critères d'acceptation
1. Rapport de diagnostic chiffré (learners sans client_id, sessions sans créneaux, statut des 949 enrollments).
2. Après Lot 1 : les apprenants dont l'entreprise matche un client (non ambigu) ont `client_id` rempli ; liste explicite des ambigus/non-matchés pour le manuel.
3. Après Lot 2 : les sessions sans créneaux ont un planning synthétisé (demi-journées, jours ouvrés) cohérent avec les heures prévues, marqué « estimé ».
4. Zéro doublon créé ; ré-exécution sans effet de bord.
5. Le client voit, dans l'espace formation, les apprenants rattachés et un planning présent.

---

## 5. Points à confirmer pendant l'implémentation
- Les **949 « duplicates »** : vérifier la clé de dédup de `loris_import.py` (`map_enrollment`) — si trop large, des inscriptions distinctes ont été fusionnées (à réinjecter).
- `stagiaires.csv` est-il le fichier **à jour** (2686 lignes vs 1090 dans `Suivi des stagiaires`) ? Confirmer la source faisant foi pour les apprenants.
- Découpage demi-journées : valider le défaut 9h-12h30 / 13h30-17h (ou autre) avec le client.

---

## 6. Suite (workflow BMAD)
Cadrage → plan d'implémentation **par lot** (writing-plans), **Lot 0 (diagnostic) en tête** — il oriente le dimensionnement et révèle l'ampleur réelle avant d'écrire quoi que ce soit. Scripts dry-run-first, joués par l'admin.
