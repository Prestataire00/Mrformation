# Validation manuelle — Chantier Solidification Questionnaires P0

> **Pour qui ?** Le développeur qui exécute les migrations dans Supabase
> Dashboard et valide le chantier `feat/questionnaires-solidification-p0`.
>
> **Quand ?** Après exécution des migrations dans le Dashboard, AVANT
> push du code sur main.
>
> **Spec source :** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md](../superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md)

---

## A. Matrice RLS (36 tests)

Pour chaque test, ouvrir Supabase Dashboard → SQL Editor et exécuter le
bloc indiqué. Pour simuler un utilisateur authentifié, utiliser :

```sql
-- Simule un utilisateur authentifié dans le contexte RLS.
-- Remplacer <user_id> par l'UUID d'un user du rôle visé.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"<user_id>","role":"authenticated"}';

-- Insérer ici la requête à tester

ROLLBACK;
```

**Prérequis** : récupérer 3 UUIDs :
- `<learner_id>` : un profile avec `role = 'learner'`
- `<trainer_id>` : un profile avec `role = 'trainer'`
- `<admin_id>` : un profile avec `role = 'admin'` ou `super_admin`

Tous les 3 dans la **même entité** (pour tester l'isolation entité ensuite, prendre aussi un `<admin_other_entity_id>`).

Et 1 session valide : `<session_id>` (peu importe laquelle, doit appartenir à la même entité que les 3 profiles).

### A.1 — Table `formation_evaluation_assignments` (12 tests)

| # | Rôle | Opération | Requête | Attendu | OK ? |
|---|------|-----------|---------|---------|------|
| 1 | learner | SELECT | `SELECT * FROM formation_evaluation_assignments WHERE session_id = '<session_id>';` | 0+ rows OK | ☐ |
| 2 | learner | INSERT | `INSERT INTO formation_evaluation_assignments (session_id, questionnaire_id, evaluation_type) VALUES ('<session_id>', '<q_id>', 'eval_preformation');` | **ERROR — new row violates row-level security policy** | ☐ |
| 3 | learner | UPDATE | `UPDATE formation_evaluation_assignments SET evaluation_type = 'eval_postformation' WHERE id = '<row_id>';` | **0 rows updated** (silent fail OK) | ☐ |
| 4 | learner | DELETE | `DELETE FROM formation_evaluation_assignments WHERE id = '<row_id>';` | **0 rows deleted** | ☐ |
| 5 | trainer | SELECT | (idem A.1.1) | 0+ rows OK | ☐ |
| 6 | trainer | INSERT | (idem A.1.2) | **ERROR — RLS** | ☐ |
| 7 | trainer | UPDATE | (idem A.1.3) | **0 rows updated** | ☐ |
| 8 | trainer | DELETE | (idem A.1.4) | **0 rows deleted** | ☐ |
| 9 | admin | SELECT | (idem A.1.1) | 0+ rows OK | ☐ |
| 10 | admin | INSERT | (idem A.1.2) | **1 row inserted** | ☐ |
| 11 | admin | UPDATE | (idem A.1.3) | **1 row updated** | ☐ |
| 12 | admin | DELETE | (idem A.1.4) | **1 row deleted** | ☐ |

### A.2 — Table `formation_satisfaction_assignments` (12 tests)

(Pattern identique à A.1 mais sur `formation_satisfaction_assignments` ;
adapter les colonnes : `satisfaction_type` au lieu de `evaluation_type`,
`target_type` + `target_id` au lieu de `learner_id`.)

| # | Rôle | Opération | Attendu | OK ? |
|---|------|-----------|---------|------|
| 13-24 | (idem A.1) | (idem A.1) | (idem A.1) | ☐ × 12 |

### A.3 — Table `questionnaire_tokens` (12 tests)

(Pattern identique à A.1.)

| # | Rôle | Opération | Attendu | OK ? |
|---|------|-----------|---------|------|
| 25-36 | (idem A.1) | (idem A.1) | (idem A.1) | ☐ × 12 |

### A.4 — Isolation cross-tenant

Bonus de 3 tests :

| # | Rôle | Requête | Attendu | OK ? |
|---|------|---------|---------|------|
| 37 | admin entité A | SELECT * FROM formation_evaluation_assignments WHERE entity_id = '<entity_B>' | **0 rows** (RLS bloque) | ☐ |
| 38 | admin entité A | INSERT dans formation_evaluation_assignments d'une session de l'entité B | **ERROR — RLS** | ☐ |
| 39 | admin entité A | UPDATE row d'entité B | **0 rows updated** | ☐ |

---

## B. Matrice trigger (Volet E) — 7 tests

**Préalable** : exécuter d'abord `sync_assignments_to_questionnaire_sessions.sql`
dans Supabase Dashboard.

**Setup** : récupérer 1 `<session_id>` (avec entité utilisateur), 1
`<questionnaire_eval_id>` (de type 'evaluation'), 1 `<questionnaire_satis_id>`
(de type 'satisfaction').

### B.1 — Tests trigger

| # | Action | Commande | Vérification | OK ? |
|---|--------|----------|--------------|------|
| 1 | INSERT 1 attribution éval | `INSERT INTO formation_evaluation_assignments (session_id, questionnaire_id, evaluation_type) VALUES ('<session_id>', '<questionnaire_eval_id>', 'eval_preformation');` | `SELECT COUNT(*) FROM questionnaire_sessions WHERE session_id = '<session_id>' AND questionnaire_id = '<questionnaire_eval_id>';` → **1** | ☐ |
| 2 | DELETE cette attribution | `DELETE FROM formation_evaluation_assignments WHERE session_id = '<session_id>' AND questionnaire_id = '<questionnaire_eval_id>';` | `SELECT COUNT(*) FROM questionnaire_sessions WHERE session_id = '<session_id>' AND questionnaire_id = '<questionnaire_eval_id>';` → **0** | ☐ |
| 3 | INSERT satis chaud + satis froid (même q, même s) | 2 INSERT dans `formation_satisfaction_assignments` avec `satisfaction_type` différent | `SELECT COUNT(*) FROM questionnaire_sessions WHERE session_id = '<session_id>' AND questionnaire_id = '<questionnaire_satis_id>';` → **1** (dédupliqué) | ☐ |
| 4 | DELETE satis chaud (garder froid) | `DELETE FROM formation_satisfaction_assignments WHERE satisfaction_type = 'satisfaction_chaud' AND session_id = '<session_id>';` | (idem #3) → **1** (miroir conservé) | ☐ |
| 5 | DELETE satis froid | `DELETE FROM formation_satisfaction_assignments WHERE satisfaction_type = 'satisfaction_froid' AND session_id = '<session_id>';` | (idem #3) → **0** | ☐ |
| 6 | UPDATE evaluation_type sur attribution existante | (créer 1 row puis) `UPDATE formation_evaluation_assignments SET evaluation_type = 'eval_postformation' WHERE id = '<row_id>';` | `SELECT * FROM questionnaire_sessions WHERE session_id = '<session_id>' AND questionnaire_id = '<questionnaire_eval_id>';` → 1 row inchangé (pas de side-effect) | ☐ |
| 7 | Vérifier backfill | Avant migration : compter les rows dans `formation_evaluation_assignments` + `formation_satisfaction_assignments` (DISTINCT q_id, s_id). Après migration : compter rows dans `questionnaire_sessions` qui ont leur counterpart. | Backfill doit avoir mirroré toutes les paires DISTINCT. | ☐ |

---

## C. Spot checks P0-3 + P0-4

### C.1 — P0-3 : Alignement enum satisfaction_type

**(Si migration `fix_satisfaction_type_enum.sql` exécutée)**

| # | Action | Attendu | OK ? |
|---|--------|---------|------|
| C1 | Dans Supabase Dashboard SQL Editor : `INSERT INTO formation_satisfaction_assignments (session_id, questionnaire_id, satisfaction_type, target_type, target_id) VALUES ('<sess>', '<q>', 'satisfaction_entreprise', 'company', '<client_id>');` | **1 row inserted** (sans erreur CHECK) | ☐ |
| C2 | Depuis UI TabQuestionnaires, attribuer un questionnaire "Satisfaction entreprise" | UI affiche succès (toast vert), 1 row apparaît dans formation_satisfaction_assignments + 1 row mirrorée dans questionnaire_sessions | ☐ |

### C.2 — P0-4 : Scoring yes_no + text

(Section enrichie par Task 7 du plan.)

---

## D. End-to-end P0-1 (résolution du découplage)

**Le test pivot du Chantier 1.** Si ce flow passe, l'admin peut piloter le
sous-système questionnaires depuis TabQuestionnaires.

### D.1 — Préparation
- Créer 1 nouvelle session vierge dans `/admin/formations/<f_id>` (peu importe
  la formation)
- Vérifier qu'aucune attribution n'existe pour cette session :
  ```sql
  SELECT COUNT(*) FROM formation_evaluation_assignments WHERE session_id = '<session_id>';
  SELECT COUNT(*) FROM formation_satisfaction_assignments WHERE session_id = '<session_id>';
  SELECT COUNT(*) FROM questionnaire_sessions WHERE session_id = '<session_id>';
  ```
  Tous → 0.

### D.2 — Attribution
- Ouvrir `/admin/formations/<f_id>` → onglet "Questionnaires"
- Dans le stage "Avant la formation", cliquer "Attribuer" → choisir un
  questionnaire d'évaluation pré-formation
- Dans le stage "Après la formation", cliquer "Attribuer" → choisir un
  questionnaire de satisfaction chaud

### D.3 — Vérification base de données

```sql
SELECT * FROM formation_evaluation_assignments WHERE session_id = '<session_id>';
-- → 1 ligne avec evaluation_type = 'eval_preformation'

SELECT * FROM formation_satisfaction_assignments WHERE session_id = '<session_id>';
-- → 1 ligne avec satisfaction_type = 'satisfaction_chaud'

SELECT * FROM questionnaire_sessions WHERE session_id = '<session_id>';
-- → 2 lignes (mirrorées par le trigger)
```

### D.4 — Vérification UI consommateurs

- **Onglet Qualiopi** : les KPIs doivent compter ces 2 attributions
  (questionnaires attribués)
- **Onglet Résumé** : éventuellement un badge ou compteur Qualiopi
- **Onglet Émargement** : pas d'effet attendu (hors scope questionnaire)

### D.5 — Submission apprenant (optionnel mais utile)

- Générer 1 token pour 1 apprenant : bouton "Générer liens QR" dans
  TabQuestionnaires
- Ouvrir le lien public `/questionnaire/<token>` dans un onglet privé
- Répondre à 1 question
- Soumettre
- Retour TabQuestionnaires admin : vérifier que le statut de l'apprenant
  passe à "Répondu"
- Cliquer "Générer PDF résultats évaluations" → le PDF s'ouvre et contient
  bien la réponse de l'apprenant ✅

**✅ Si D.5 passe entièrement, le découplage architectural (P0-1) est
résolu — l'objectif principal du chantier est atteint.**

---

## E. Résultats de la validation

(Section à remplir au moment de l'exécution. Date, dev, observations.)

- **Date d'exécution** : _________________
- **Développeur** : _________________
- **Migrations exécutées dans le Dashboard** :
  - [ ] `fix_questionnaires_rls_strict.sql` à _____ (HH:MM)
  - [ ] `sync_assignments_to_questionnaire_sessions.sql` à _____ (HH:MM)
  - [ ] `fix_satisfaction_type_enum.sql` à _____ (HH:MM) — si applicable
- **Tests A (RLS, 39 tests)** : __ / 39 verts
- **Tests B (trigger, 7 tests)** : __ / 7 verts
- **Tests C (spot checks)** : __ / __ verts
- **Test D (end-to-end)** : ☐ vert
- **Observations / incidents** : _________________
- **Décision push prod** : ☐ Go / ☐ No-go
