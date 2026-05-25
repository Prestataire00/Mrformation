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

(Section ajoutée par Task 4 du plan.)

---

## C. Spot checks P0-3 + P0-4

(Section ajoutée par Tasks 5 et 7 du plan.)

---

## D. End-to-end P0-1 (résolution du découplage)

(Section ajoutée par Task 4 du plan.)

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
