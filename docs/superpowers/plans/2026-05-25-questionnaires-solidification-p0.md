# Plan d'implémentation — Solidification Questionnaires P0 (Chantier 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Déverrouiller le pilotage du sous-système Questionnaires en corrigeant 4 bugs P0 (sécurité RLS, découplage architectural data, enum incompatible, scoring yes_no bugué) sans toucher aux consommateurs.

**Architecture:** 3 migrations SQL (1 RLS strictes + 1 trigger PG SECURITY DEFINER mirroring + 1 conditionnée alignement enum) + 1 fix code TypeScript (scoring `isCorrect()`) + 6 tests Vitest régression + 2 documents de tests manuels Markdown (matrices RLS + trigger + end-to-end). Aucun consommateur (PDFs, KPIs Qualiopi, portail learner) n'est touché — le trigger SQL alimente automatiquement `questionnaire_sessions` à partir des nouvelles tables.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (PostgreSQL + RLS + plpgsql), Vitest. Migrations à exécuter manuellement dans Supabase Dashboard avant push code.

**Spec source:** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md](../specs/2026-05-25-questionnaires-solidification-p0-design.md)
**Deep-dive source:** [docs/deep-dive-tab-questionnaires.md](../../deep-dive-tab-questionnaires.md)

**Risques modérés assumés** :
- Trigger PG `SECURITY DEFINER` en prod (validation manuelle exhaustive Task 9)
- RLS strictes peuvent bloquer un cas non identifié (matrice 36 tests Task 9)
- Migrations SQL doivent être exécutées **avant** push code (Task 8 doc explicite)

---

## Vue d'ensemble des fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `supabase/migrations/fix_questionnaires_rls_strict.sql` | RLS strictes par rôle sur 3 tables (Volet A) |
| `supabase/migrations/sync_assignments_to_questionnaire_sessions.sql` | Trigger PG SECURITY DEFINER + backfill (Volet E) |
| `supabase/migrations/fix_satisfaction_type_enum.sql` | Aligner CHECK constraint UI ↔ DB (P0-3, conditionné) |
| `src/lib/services/__tests__/load-evaluation-results.test.ts` | 6 tests Vitest régression scoring (P0-4) |
| `docs/tests/2026-05-25-rls-questionnaires-validation.md` | Matrices 36 tests RLS + 7 tests trigger + end-to-end P0-1 |

### Modifiés
| Fichier | Changement |
|---|---|
| `src/lib/services/load-evaluation-results.ts` | Refactor `isCorrect()` : factoriser `normalize()`, fix yes_no + text (guard null + accents). Export de `isCorrect` pour testabilité. |

### Hors du repo (exécutés manuellement dans Supabase Dashboard avant push code)
- Les 3 migrations SQL ci-dessus, dans cet ordre :
  1. `fix_questionnaires_rls_strict.sql`
  2. `sync_assignments_to_questionnaire_sessions.sql`
  3. `fix_satisfaction_type_enum.sql` (si écart Investigation B confirmé en Task 0)

---

## Task 0 : Baseline + branche + investigations préalables

**Files:**
- Read-only (investigation)

- [ ] **Step 1 : Vérifier état initial (green baseline)**

Run:
```bash
git status
git branch --show-current
npx vitest run 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -5
```
Expected: branche `main` à commit `364e3f1` (spec validée), 489 tests verts, TypeScript clean.

- [ ] **Step 2 : Créer la branche**

```bash
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/questionnaires-solidification-p0
```

- [ ] **Step 3 : Investigation A — Lister les policies RLS actuelles sur les 3 tables**

Run:
```bash
grep -nA 8 "CREATE POLICY" supabase/migrations/add-evaluation-tab.sql supabase/migrations/add-satisfaction-tab.sql supabase/migrations/add_questionnaire_public_tokens.sql 2>/dev/null
```

Documenter dans un commentaire local (pas de commit) :
- Pour chaque table, le **nom exact** de la policy actuelle (sera utilisé en `DROP POLICY` de Task 1)
- Confirmer que le pattern est bien `FOR ALL USING (entity match)` sans check de rôle

- [ ] **Step 4 : Investigation B (P0-3) — Lister les satisfaction_type proposés par l'UI vs CHECK constraint DB**

Run pour lister les types proposés par TabQuestionnaires :
```bash
grep -nE '"satisfaction_[a-z_]+"' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx' | head -30
```

Run pour lister la CHECK constraint DB :
```bash
grep -nB 1 -A 10 "satisfaction_type" supabase/migrations/add-satisfaction-tab.sql | head -30
```

Analyser le résultat :
- **Cas 1 — Écart confirmé** : l'UI propose des valeurs absentes de la CHECK constraint (typiquement `satisfaction_entreprise`). Noter la liste exhaustive UI vs DB. Task 5 produira la migration. **Documenter dans un commit message à la fin de Task 5.**
- **Cas 2 — Pas d'écart** : la CHECK constraint accepte déjà toutes les valeurs UI. Task 5 sera skippée. Documenter dans un commit doc à la fin de la phase d'investigation.

Pas de commit nécessaire pour Task 0 — c'est de l'investigation préparatoire.

---

## Task 1 : Volet A — Migration RLS strictes

**Files:**
- Create: `supabase/migrations/fix_questionnaires_rls_strict.sql`

- [ ] **Step 1 : Créer la migration RLS**

Créer `supabase/migrations/fix_questionnaires_rls_strict.sql` :

```sql
-- ============================================================================
-- Migration : RLS strictes par rôle sur les tables d'attribution de
-- questionnaires (3 tables). Résout P0-2 du deep-dive 2026-05-25.
--
-- AVANT : 3 policies FOR ALL USING (entity match) — un learner authentifié
--         dans la même entité pouvait INSERT/UPDATE/DELETE.
-- APRÈS : 4 policies par table (SELECT autorisé entity match,
--         INSERT/UPDATE/DELETE restreints à admin/super_admin).
--
-- Source : docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md §4
-- ============================================================================

-- ============================================================================
-- 1. formation_evaluation_assignments
-- ============================================================================

-- DROP de la policy actuelle (nom à confirmer en Task 0 Investigation A)
DROP POLICY IF EXISTS "Admins manage formation_evaluation_assignments"
  ON formation_evaluation_assignments;
DROP POLICY IF EXISTS "formation_evaluation_assignments_all"
  ON formation_evaluation_assignments;

-- SELECT : tout utilisateur authentifié de la même entité (admin/trainer/learner)
CREATE POLICY "fea_select_entity" ON formation_evaluation_assignments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
    )
  );

-- INSERT : admin/super_admin uniquement (entity scoped)
CREATE POLICY "fea_insert_admin" ON formation_evaluation_assignments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- UPDATE : admin/super_admin uniquement (entity scoped, sur OLD et NEW)
CREATE POLICY "fea_update_admin" ON formation_evaluation_assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- DELETE : admin/super_admin uniquement (entity scoped)
CREATE POLICY "fea_delete_admin" ON formation_evaluation_assignments
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ============================================================================
-- 2. formation_satisfaction_assignments (pattern identique)
-- ============================================================================

DROP POLICY IF EXISTS "Admins manage formation_satisfaction_assignments"
  ON formation_satisfaction_assignments;
DROP POLICY IF EXISTS "formation_satisfaction_assignments_all"
  ON formation_satisfaction_assignments;

CREATE POLICY "fsa_select_entity" ON formation_satisfaction_assignments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
    )
  );

CREATE POLICY "fsa_insert_admin" ON formation_satisfaction_assignments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "fsa_update_admin" ON formation_satisfaction_assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "fsa_delete_admin" ON formation_satisfaction_assignments
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_satisfaction_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ============================================================================
-- 3. questionnaire_tokens (déjà filtré par entity_id direct)
-- ============================================================================

DROP POLICY IF EXISTS "Admins manage questionnaire_tokens"
  ON questionnaire_tokens;
DROP POLICY IF EXISTS "questionnaire_tokens_all"
  ON questionnaire_tokens;

CREATE POLICY "qt_select_entity" ON questionnaire_tokens
  FOR SELECT TO authenticated USING (
    entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "qt_insert_admin" ON questionnaire_tokens
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "qt_update_admin" ON questionnaire_tokens
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "qt_delete_admin" ON questionnaire_tokens
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.entity_id = questionnaire_tokens.entity_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- Note : les opérations de submit public (public-submit/route.ts) passent
-- en service_role (bypass RLS) — ces policies ne les affectent pas.
```

**Note importante** : les noms `"Admins manage <table>"` et `"<table>_all"` dans les `DROP POLICY IF EXISTS` couvrent les 2 patterns possibles. **Si Task 0 Investigation A révèle un nom différent**, l'adjustement est trivial : ajouter `DROP POLICY IF EXISTS "<nom_exact>"` avant les `CREATE POLICY`.

- [ ] **Step 2 : Vérifier la syntaxe SQL en local (lint visuel)**

Run:
```bash
cat supabase/migrations/fix_questionnaires_rls_strict.sql | wc -l
grep -c "CREATE POLICY" supabase/migrations/fix_questionnaires_rls_strict.sql
grep -c "DROP POLICY" supabase/migrations/fix_questionnaires_rls_strict.sql
```
Expected:
- ~170 lignes
- **12** `CREATE POLICY` (4 policies × 3 tables)
- **6** `DROP POLICY IF EXISTS` (2 noms candidats × 3 tables)

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/fix_questionnaires_rls_strict.sql
git commit -m "feat(questionnaires): RLS strictes par rôle sur 3 tables (Volet A)

DROP les 3 policies FOR ALL USING (entity match) sans check de rôle —
faille P0-2 du deep-dive 2026-05-25 : un learner authentifié dans la
même entité pouvait INSERT/UPDATE/DELETE.

CREATE 4 policies par table (12 au total) :
- SELECT : autorisé à tout utilisateur authentifié de la même entité
- INSERT/UPDATE/DELETE : restreints à admin/super_admin (entity scoped)

Tables couvertes :
- formation_evaluation_assignments
- formation_satisfaction_assignments
- questionnaire_tokens (les opérations publiques passent en service_role)

⚠ À exécuter manuellement dans Supabase Dashboard AVANT push code.
Validation manuelle : matrice 36 tests dans docs/tests/2026-05-25-rls-
questionnaires-validation.md (Task 2)."
```

---

## Task 2 : Volet A — Tests RLS manuels documentés

**Files:**
- Create: `docs/tests/2026-05-25-rls-questionnaires-validation.md`

- [ ] **Step 1 : Créer le document de tests manuels**

Créer `docs/tests/2026-05-25-rls-questionnaires-validation.md` :

```markdown
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
```

- [ ] **Step 2 : Vérifier que le document existe et est lisible**

Run:
```bash
ls -la docs/tests/2026-05-25-rls-questionnaires-validation.md
wc -l docs/tests/2026-05-25-rls-questionnaires-validation.md
head -10 docs/tests/2026-05-25-rls-questionnaires-validation.md
```
Expected: fichier présent, ~120 lignes, header markdown propre.

- [ ] **Step 3 : Commit**

```bash
git add docs/tests/2026-05-25-rls-questionnaires-validation.md
git commit -m "docs(questionnaires): matrice 39 tests RLS manuels (Volet A)

Document de validation manuelle à exécuter dans Supabase Dashboard SQL
Editor APRÈS exécution de la migration fix_questionnaires_rls_strict.sql
et AVANT push code prod.

3 tables × 4 opérations × 3 rôles = 36 tests + 3 tests cross-tenant.

Sections B (trigger), C (P0-3/P0-4 spot checks) et D (end-to-end P0-1)
seront ajoutées par Tasks 4, 5 et 7 du plan."
```

---

## Task 3 : Volet E — Migration trigger PG de mirroring

**Files:**
- Create: `supabase/migrations/sync_assignments_to_questionnaire_sessions.sql`

- [ ] **Step 1 : Créer la migration**

Créer `supabase/migrations/sync_assignments_to_questionnaire_sessions.sql` :

```sql
-- ============================================================================
-- Migration : Trigger PostgreSQL de mirroring (Volet E) — résout P0-1 du
-- deep-dive 2026-05-25 (découplage architectural data).
--
-- AVANT : TabQuestionnaires écrit dans formation_evaluation_assignments /
--         formation_satisfaction_assignments mais TOUS les consommateurs
--         (PDFs loadSessionAggregates, KPIs Qualiopi loadQualiopiIndicators,
--         portail learner, auto-send cron) lisent questionnaire_sessions.
--         Aucun trigger ne synchronise → admin attribue dans le vide.
--
-- APRÈS : Trigger AFTER INSERT/UPDATE/DELETE sur les 2 nouvelles tables
--         alimente automatiquement questionnaire_sessions (uni-directionnel).
--         Backfill one-time pour les attributions existantes.
--
-- Stratégie 3 (cf brainstorming Q2) : préserve la granularité satisfaction_
-- chaud/froid dans les nouvelles tables ; le miroir questionnaire_sessions
-- reste générique (1 ligne par couple (q_id, s_id)).
--
-- Source : docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md §5
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fonction de mirroring
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_assignment_to_questionnaire_sessions()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Upsert dans questionnaire_sessions (idempotent grâce à ON CONFLICT)
    INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
    VALUES (NEW.questionnaire_id, NEW.session_id, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Si la paire (q_id, s_id) ne change pas (typique : modif evaluation_type
    -- ou learner_id), no-op : le miroir reste inchangé.
    IF OLD.questionnaire_id = NEW.questionnaire_id
       AND OLD.session_id = NEW.session_id THEN
      RETURN NEW;
    END IF;

    -- Cas rare : la paire change. Supprimer l'ancien miroir si plus aucune
    -- attribution pour cette paire dans l'une des 2 tables.
    IF NOT EXISTS (
      SELECT 1 FROM formation_evaluation_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) AND NOT EXISTS (
      SELECT 1 FROM formation_satisfaction_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) THEN
      DELETE FROM questionnaire_sessions
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id;
    END IF;

    -- Insérer le nouveau miroir
    INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
    VALUES (NEW.questionnaire_id, NEW.session_id, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Garder le miroir tant qu'il reste au moins 1 attribution pour ce couple
    -- (cas typique : satisfaction_chaud + satisfaction_froid du même
    -- questionnaire — on garde le miroir tant que l'un des deux existe).
    IF NOT EXISTS (
      SELECT 1 FROM formation_evaluation_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) AND NOT EXISTS (
      SELECT 1 FROM formation_satisfaction_assignments
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id
    ) THEN
      DELETE FROM questionnaire_sessions
      WHERE questionnaire_id = OLD.questionnaire_id AND session_id = OLD.session_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER permet au trigger d'écrire dans questionnaire_sessions
-- même si l'appelant n'a pas les permissions directes (les RLS strictes du
-- Volet A peuvent bloquer un INSERT direct par un admin via service client).

-- ----------------------------------------------------------------------------
-- 2. Triggers (2)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sync_eval_assignment ON formation_evaluation_assignments;
CREATE TRIGGER trg_sync_eval_assignment
  AFTER INSERT OR UPDATE OR DELETE ON formation_evaluation_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_assignment_to_questionnaire_sessions();

DROP TRIGGER IF EXISTS trg_sync_satis_assignment ON formation_satisfaction_assignments;
CREATE TRIGGER trg_sync_satis_assignment
  AFTER INSERT OR UPDATE OR DELETE ON formation_satisfaction_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_assignment_to_questionnaire_sessions();

-- ----------------------------------------------------------------------------
-- 3. Backfill one-time
-- ----------------------------------------------------------------------------

-- Pour chaque paire (questionnaire_id, session_id) existante dans l'une des
-- 2 nouvelles tables et absente de questionnaire_sessions, créer le miroir.
-- ON CONFLICT DO NOTHING empêche d'écraser les attributions legacy faites
-- via /admin/questionnaires/page.tsx directement.

INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
SELECT questionnaire_id, session_id, MIN(created_at) AS created_at
FROM (
  SELECT questionnaire_id, session_id, created_at FROM formation_evaluation_assignments
  UNION ALL
  SELECT questionnaire_id, session_id, created_at FROM formation_satisfaction_assignments
) AS all_assignments
GROUP BY questionnaire_id, session_id
ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
```

- [ ] **Step 2 : Vérifier la syntaxe SQL (lint visuel)**

Run:
```bash
cat supabase/migrations/sync_assignments_to_questionnaire_sessions.sql | wc -l
grep -c "CREATE TRIGGER\|CREATE OR REPLACE FUNCTION\|INSERT INTO questionnaire_sessions" supabase/migrations/sync_assignments_to_questionnaire_sessions.sql
```
Expected:
- ~90 lignes
- **5** occurrences (1 fonction + 2 triggers + 1 backfill INSERT + 2 INSERTS dans la fonction)

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/sync_assignments_to_questionnaire_sessions.sql
git commit -m "feat(questionnaires): trigger PG de mirroring vers questionnaire_sessions (Volet E)

Résout P0-1 du deep-dive 2026-05-25 (découplage architectural data).

Fonction PG sync_assignment_to_questionnaire_sessions() SECURITY DEFINER
qui mirror INSERT/UPDATE/DELETE des nouvelles tables vers la table miroir
historique. 2 triggers AFTER INSERT/UPDATE/DELETE sur formation_evaluation_
assignments et formation_satisfaction_assignments.

Choix de design (cf spec §5.2) :
- Mirroring uni-directionnel (nouvelles → ancienne) — pas de complexité
  bi-directionnelle
- ON CONFLICT DO NOTHING — n'écrase pas les attributions legacy
- DELETE conditionné (NOT EXISTS dans LES DEUX tables) — préserve le
  miroir tant que satisfaction_chaud OU satisfaction_froid existe
- UPDATE inclus — forward compat si TabQuestionnaires évolue
- SECURITY DEFINER — bypass RLS de questionnaire_sessions intentionnellement

Backfill one-time UNION ALL + GROUP BY + ON CONFLICT DO NOTHING pour
mirrorer les attributions existantes pré-trigger.

⚠ À exécuter manuellement dans Supabase Dashboard APRÈS la migration
fix_questionnaires_rls_strict.sql (Volet A) et AVANT push code.
Validation : Task 4 ajoute la matrice 7 tests + end-to-end P0-1."
```

---

## Task 4 : Volet E — Tests trigger manuels documentés

**Files:**
- Modify: `docs/tests/2026-05-25-rls-questionnaires-validation.md`

- [ ] **Step 1 : Ajouter la section B (matrice trigger) au document**

Remplacer la section `## B. Matrice trigger (Volet E) — 7 tests` (actuellement un placeholder) dans `docs/tests/2026-05-25-rls-questionnaires-validation.md` par :

```markdown
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
```

- [ ] **Step 2 : Ajouter la section D (end-to-end P0-1) au document**

Remplacer la section `## D. End-to-end P0-1 (résolution du découplage)` par :

```markdown
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
```

- [ ] **Step 3 : Commit**

```bash
git add docs/tests/2026-05-25-rls-questionnaires-validation.md
git commit -m "docs(questionnaires): matrice 7 tests trigger + end-to-end P0-1 (Volet E)

Sections B et D du document de validation manuelle :
- B : 7 tests de validation du trigger sync_assignment_to_questionnaire_
  sessions (INSERT, DELETE, dedup, UPDATE no-op, backfill)
- D : test end-to-end pivot P0-1 — création session → attribution via
  TabQuestionnaires → réponse apprenant → PDF résultats avec data + KPIs
  Qualiopi corrects

Si D passe, l'objectif principal du chantier est atteint."
```

---

## Task 5 : P0-3 (conditionné) — Migration alignement enum

**Files:**
- Create (si Task 0 Investigation B Cas 1 confirmé): `supabase/migrations/fix_satisfaction_type_enum.sql`
- Sinon : pas de fichier créé, juste un commit doc

- [ ] **Step 1 : Décider du chemin selon Task 0 Investigation B**

Récapituler le résultat de Task 0 Step 4 (Investigation B) :

- **Cas 1 — Écart confirmé** : l'UI propose des valeurs absentes de la CHECK constraint DB. → continuer Step 2.
- **Cas 2 — Pas d'écart** : la CHECK accepte toutes les valeurs UI. → sauter directement Step 5 (commit doc).

- [ ] **Step 2 (Cas 1) : Identifier le nom exact de la CHECK constraint actuelle**

Run:
```bash
grep -nE "CONSTRAINT.*satisfaction_type|satisfaction_type.*CHECK" supabase/migrations/add-satisfaction-tab.sql
```

Noter le nom exact. Si la CHECK est inline (pas nommée), récupérer le nom auto-généré par PostgreSQL avec :
```sql
-- À exécuter dans Supabase Dashboard pour identifier le nom
SELECT conname FROM pg_constraint
WHERE conrelid = 'formation_satisfaction_assignments'::regclass
  AND contype = 'c';
```

- [ ] **Step 3 (Cas 1) : Créer la migration**

Créer `supabase/migrations/fix_satisfaction_type_enum.sql` :

```sql
-- ============================================================================
-- Migration : Aligner CHECK constraint formation_satisfaction_assignments.
-- satisfaction_type avec les valeurs proposées par l'UI TabQuestionnaires.
--
-- Résout P0-3 du deep-dive 2026-05-25 (UI propose 'satisfaction_entreprise'
-- — et potentiellement d'autres — mais la CHECK constraint DB les refuse,
-- causant un crash silencieux à l'attribution).
--
-- Source : docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md §6.1
-- ============================================================================

-- DROP de l'ancienne CHECK (nom exact identifié en Task 5 Step 2)
ALTER TABLE formation_satisfaction_assignments
  DROP CONSTRAINT IF EXISTS formation_satisfaction_assignments_satisfaction_type_check;
ALTER TABLE formation_satisfaction_assignments
  DROP CONSTRAINT IF EXISTS satisfaction_type_check;
-- ↑ 2 candidats — le réel sera dans l'investigation

-- ADD nouvelle CHECK avec liste exhaustive UI
-- ⚠ La liste suivante doit refléter EXACTEMENT les valeurs proposées par
-- TabQuestionnaires.tsx — à compléter avec le résultat de Task 0 Inv B.
ALTER TABLE formation_satisfaction_assignments
  ADD CONSTRAINT formation_satisfaction_assignments_satisfaction_type_check
  CHECK (satisfaction_type IN (
    'satisfaction_chaud',
    'satisfaction_froid',
    'satisfaction_entreprise'
    -- + autres valeurs UI à confirmer (cf Task 0 Inv B output)
  ));
```

**Note importante** : la liste IN (...) doit être complétée avec **exactement** les valeurs détectées dans `TabQuestionnaires.tsx` STAGES. Si Task 0 a révélé 4 valeurs, mettre les 4. Si 5, mettre les 5. **Ne jamais inventer une valeur** — risque de désaligner avec l'UI.

- [ ] **Step 4 (Cas 1) : Vérifier la syntaxe SQL**

Run:
```bash
cat supabase/migrations/fix_satisfaction_type_enum.sql | wc -l
grep -c "ALTER TABLE" supabase/migrations/fix_satisfaction_type_enum.sql
```
Expected: ~25 lignes, 3 `ALTER TABLE` (2 DROP + 1 ADD).

- [ ] **Step 5 : Ajouter spot check au document de validation**

Remplacer la section `## C. Spot checks P0-3 + P0-4` dans `docs/tests/2026-05-25-rls-questionnaires-validation.md` par :

```markdown
## C. Spot checks P0-3 + P0-4

### C.1 — P0-3 : Alignement enum satisfaction_type

**(Si migration `fix_satisfaction_type_enum.sql` exécutée)**

| # | Action | Attendu | OK ? |
|---|--------|---------|------|
| C1 | Dans Supabase Dashboard SQL Editor : `INSERT INTO formation_satisfaction_assignments (session_id, questionnaire_id, satisfaction_type, target_type, target_id) VALUES ('<sess>', '<q>', 'satisfaction_entreprise', 'company', '<client_id>');` | **1 row inserted** (sans erreur CHECK) | ☐ |
| C2 | Depuis UI TabQuestionnaires, attribuer un questionnaire "Satisfaction entreprise" | UI affiche succès (toast vert), 1 row apparaît dans formation_satisfaction_assignments + 1 row mirrorée dans questionnaire_sessions | ☐ |

**(Si Task 0 Investigation B a révélé pas d'écart)**

Documenter dans la cellule "Résultats" Section E : "P0-3 non applicable —
aucun écart UI ↔ DB CHECK constraint détecté en Task 0."

### C.2 — P0-4 : Scoring yes_no + text

| # | Action | Attendu | OK ? |
|---|--------|---------|------|
| C3 | `npx vitest run src/lib/services/__tests__/load-evaluation-results.test.ts` | **6 tests verts** | ☐ |
| C4 | Spot check manuel : 1 session avec 1 apprenant qui répond "non" à 1 question yes_no dont correct="oui" — vérifier que le résultat affiché dans `loadEvaluationResults` est **incorrect** (vs 100% en bug actuel) | Statut "non acquis" si seuil 70% non atteint | ☐ |
| C5 | Spot check : "Élève" (avec accent) vs correct="eleve" (sans accent) → marqué **correct** (normalisation accents) | OK | ☐ |
```

- [ ] **Step 6 : Commit (Cas 1 — migration créée)**

```bash
git add supabase/migrations/fix_satisfaction_type_enum.sql docs/tests/2026-05-25-rls-questionnaires-validation.md
git commit -m "feat(questionnaires): aligner CHECK satisfaction_type UI ↔ DB (P0-3)

Investigation Task 0 a confirmé l'écart : l'UI TabQuestionnaires propose
les valeurs <liste exacte> mais la CHECK constraint DB rejetait
<valeurs manquantes>.

DROP de l'ancienne CHECK + ADD avec la liste exhaustive UI.

Spot check C1+C2 ajoutés au document de validation manuelle.

⚠ À exécuter manuellement dans Supabase Dashboard APRÈS les 2 migrations
précédentes (Volet A + Volet E)."
```

OU **commit (Cas 2 — pas d'écart, P0-3 skippé)** :

```bash
git add docs/tests/2026-05-25-rls-questionnaires-validation.md
git commit -m "docs(questionnaires): P0-3 retiré du scope — aucun écart UI ↔ DB confirmé

Investigation Task 0 a comparé les valeurs satisfaction_type proposées
par TabQuestionnaires.tsx avec la CHECK constraint DB de
formation_satisfaction_assignments : la CHECK accepte déjà toutes les
valeurs UI. P0-3 retiré du scope du chantier — pas de migration nécessaire.

Document de validation mis à jour : section C.1 'P0-3 non applicable'."
```

---

## Task 6 : P0-4 — Tests Vitest FAILING-FIRST (TDD)

**Files:**
- Create: `src/lib/services/__tests__/load-evaluation-results.test.ts`

- [ ] **Step 1 : Vérifier que `isCorrect` est exportable**

Run:
```bash
grep -nE "function isCorrect|export function isCorrect" src/lib/services/load-evaluation-results.ts
```

Si la fonction n'est pas exportée (ligne 49 dans le fichier actuel), on l'exportera dans Task 7. Pour l'instant, écrire les tests qui importent une fonction exportée.

- [ ] **Step 2 : Écrire les 6 tests Vitest**

Créer `src/lib/services/__tests__/load-evaluation-results.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { isCorrect } from "@/lib/services/load-evaluation-results";

/**
 * Tests régression P0-4 (deep-dive 2026-05-25) :
 * - yes_no : Boolean("non") === Boolean("oui") === true (faux positif 100% scoring)
 * - text : pas de normalisation accents + pas de guard null/undefined
 */
describe("isCorrect — scoring questionnaire (P0-4 régression)", () => {
  describe("yes_no / true_false", () => {
    it("retourne true quand 'oui' == 'oui'", () => {
      const question = { id: "q1", type: "yes_no", options: { correct_answer: "oui" } };
      expect(isCorrect(question, "oui")).toBe(true);
    });

    it("retourne false quand 'non' != 'oui' (régression bug Boolean)", () => {
      // Avant le fix : Boolean("non") === Boolean("oui") === true === true → TRUE (bug)
      // Après le fix : normalize("non") === normalize("oui") → "non" === "oui" → FALSE
      const question = { id: "q1", type: "yes_no", options: { correct_answer: "oui" } };
      expect(isCorrect(question, "non")).toBe(false);
    });

    it("retourne true insensible à la casse 'OUI' == 'oui'", () => {
      const question = { id: "q1", type: "yes_no", options: { correct_answer: "oui" } };
      expect(isCorrect(question, "OUI")).toBe(true);
    });
  });

  describe("text / short_answer", () => {
    it("retourne true avec normalisation accents 'élève' == 'eleve'", () => {
      const question = { id: "q1", type: "text", options: { correct_answer: "eleve" } };
      expect(isCorrect(question, "élève")).toBe(true);
    });

    it("retourne null quand correct_answer est null (guard)", () => {
      // Avant le fix : String(null).trim().toLowerCase() === "null" → si user dit "null", true (bug)
      // Après le fix : guard explicite → null (non scorable)
      const question = { id: "q1", type: "text", options: { correct_answer: null } };
      expect(isCorrect(question, "null")).toBe(null);
    });

    it("retourne true après trim '  Hello  ' == 'hello'", () => {
      const question = { id: "q1", type: "text", options: { correct_answer: "hello" } };
      expect(isCorrect(question, "  Hello  ")).toBe(true);
    });
  });
});
```

- [ ] **Step 3 : Vérifier que les tests échouent (TDD red phase)**

Run:
```bash
npx vitest run src/lib/services/__tests__/load-evaluation-results.test.ts 2>&1 | tail -15
```

Expected : **erreur d'import** car `isCorrect` n'est pas exportée. Message attendu : `does not export 'isCorrect'` ou similaire.

C'est attendu — Task 7 va exporter la fonction + corriger sa logique.

- [ ] **Step 4 : Commit (tests failing)**

```bash
git add src/lib/services/__tests__/load-evaluation-results.test.ts
git commit -m "test(questionnaires): 6 tests Vitest régression scoring P0-4 (failing first)

3 tests yes_no + 3 tests text. Tous échouent actuellement car isCorrect()
n'est pas exportée depuis load-evaluation-results.ts.

Couvre :
- yes_no : régression Boolean('non') === Boolean('oui') === true
- text : normalisation accents (NFD), guard null/undefined, trim

Task 7 va exporter la fonction + appliquer le fix (normalize factorisée
+ guard explicite)."
```

---

## Task 7 : P0-4 — Fix `isCorrect()` + export

**Files:**
- Modify: `src/lib/services/load-evaluation-results.ts:48-72`

- [ ] **Step 1 : Lire le code actuel**

Run:
```bash
sed -n '40,75p' src/lib/services/load-evaluation-results.ts
```

Confirmer que `isCorrect` est définie autour de la ligne 49 sans `export`, et que la logique yes_no (ligne 58-59) + text (ligne 61-62) correspond à ce qui est dans la spec §6.

- [ ] **Step 2 : Appliquer le fix**

Remplacer le bloc de la fonction `isCorrect` (lignes ~48-72 du fichier actuel) par :

```ts
/** Normalise une réponse pour comparaison : trim + lowercase + suppression accents (NFD). */
const normalize = (v: unknown): string =>
  String(v ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Détermine si la réponse de l'apprenant matche la correct_answer de la question. */
export function isCorrect(question: QuestionRow, userAnswer: unknown): boolean | null {
  const opts = question.options as { correct_answer?: unknown } | null;
  if (!opts || opts.correct_answer === undefined) return null; // pas scorable
  const correct = opts.correct_answer;

  if (question.type === "multiple_choice") {
    // correct_answer = index 0-3, user response = index ou label
    // Note : bug latent (label non géré) reporté à Chantier 2 — voir deep-dive §3.6
    return Number(userAnswer) === Number(correct);
  }
  if (question.type === "yes_no" || question.type === "true_false") {
    // Fix P0-4 : comparaison string normalisée (avant : Boolean(userAnswer) === Boolean(correct)
    // qui faisait Boolean("non") === Boolean("oui") === true → 100% scoring bug)
    return normalize(userAnswer) === normalize(correct);
  }
  if (question.type === "text" || question.type === "short_answer") {
    // Fix P0-4 : guard null/undefined avant normalisation
    // (avant : String(null) === "null" → si user dit "null", matche faussement)
    if (correct === null || correct === undefined) return null;
    return normalize(userAnswer) === normalize(correct);
  }
  if (question.type === "rating") {
    // rating n'est pas vraiment scorable au sens "bonne/mauvaise réponse" ;
    // on l'exclut du calcul.
    return null;
  }
  return null;
}
```

**Changements** :
1. Ajout de `export` devant `function isCorrect` pour testabilité
2. Ajout de la fonction `normalize` au-dessus
3. Fix branche `yes_no` : `Boolean(...) === Boolean(...)` → `normalize(...) === normalize(...)`
4. Fix branche `text` : ajout du guard null + `normalize(...) === normalize(...)`
5. Commentaires explicatifs sur les corrections

- [ ] **Step 3 : Vérifier que les 6 tests passent (TDD green phase)**

Run:
```bash
npx vitest run src/lib/services/__tests__/load-evaluation-results.test.ts 2>&1 | tail -10
```
Expected : **6 tests verts**, output type `Test Files  1 passed (1) | Tests  6 passed (6)`.

- [ ] **Step 4 : Vérifier la suite globale + tsc**

Run:
```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit 2>&1 | head -5
```
Expected : ≥ **495 tests verts** (489 baseline + 6 nouveaux), TypeScript clean.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/services/load-evaluation-results.ts
git commit -m "fix(scoring): isCorrect() factorise normalize + fix yes_no + text (P0-4)

Résout 2 bugs latents identifiés par l'audit étendu du deep-dive 2026-05-25 §3.6.

1. yes_no / true_false (P0-4 critique) — AVANT :
     Boolean(userAnswer) === Boolean(correct)
   APRÈS :
     normalize(userAnswer) === normalize(correct)
   Bug : Boolean('non') === Boolean('oui') === true → toutes les yes_no scoraient 100%.

2. text / short_answer (P1 modéré) :
   - Ajout d'un guard 'if (correct === null || correct === undefined) return null'
     (avant : String(null) → 'null' → si user dit 'null', matche faussement)
   - Normalisation accents via NFD (avant : 'Élève' ≠ 'eleve')

Fonction isCorrect désormais exportée pour testabilité. 6 tests Vitest
régression (Task 6) passent."
```

---

## Task 8 : Documentation des migrations à exécuter manuellement

**Files:**
- Modify: `docs/tests/2026-05-25-rls-questionnaires-validation.md` (section E)

- [ ] **Step 1 : Mettre à jour la section E (Résultats) du document de validation**

Remplacer la section `## E. Résultats de la validation` par :

```markdown
## E. Procédure d'exécution

### E.1 — Ordre d'exécution des migrations dans Supabase Dashboard

À exécuter **avant** push du code de la branche `feat/questionnaires-solidification-p0` sur `main`.

1. Ouvrir Supabase Dashboard → SQL Editor
2. Exécuter dans l'ordre :
   1. **`supabase/migrations/fix_questionnaires_rls_strict.sql`**
      - Crée 12 policies (4 par table × 3 tables)
      - Vérification : `SELECT polname FROM pg_policy WHERE polrelid IN ('formation_evaluation_assignments'::regclass, 'formation_satisfaction_assignments'::regclass, 'questionnaire_tokens'::regclass) ORDER BY polrelid, polname;` → 12 lignes
   2. **`supabase/migrations/sync_assignments_to_questionnaire_sessions.sql`**
      - Crée la fonction `sync_assignment_to_questionnaire_sessions` + 2 triggers + backfill
      - Vérification : `SELECT trigger_name FROM information_schema.triggers WHERE event_object_table IN ('formation_evaluation_assignments', 'formation_satisfaction_assignments');` → 2 triggers
   3. **`supabase/migrations/fix_satisfaction_type_enum.sql`** (si applicable)
      - DROP + ADD CHECK sur `formation_satisfaction_assignments.satisfaction_type`
      - Vérification : `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'formation_satisfaction_assignments'::regclass AND contype = 'c';` → liste avec les valeurs UI

### E.2 — Exécution des tests

- **Tests A (RLS, 39)** : Section A — durée estimée 30-45 min
- **Tests B (trigger, 7)** : Section B — durée estimée 20-30 min
- **Tests C (spot checks)** : Section C — durée estimée 10 min
- **Test D (end-to-end)** : Section D — durée estimée 15-20 min

**Total** : ~1h15-1h45 de validation manuelle.

### E.3 — Résultats de l'exécution

À remplir au moment de la validation.

- **Date d'exécution** : _________________
- **Développeur** : _________________
- **Migrations exécutées** :
  - [ ] `fix_questionnaires_rls_strict.sql` à _____ (HH:MM)
  - [ ] `sync_assignments_to_questionnaire_sessions.sql` à _____ (HH:MM)
  - [ ] `fix_satisfaction_type_enum.sql` à _____ (HH:MM) — si applicable
- **Tests A (RLS, 39)** : __ / 39 verts
- **Tests B (trigger, 7)** : __ / 7 verts
- **Tests C (spot checks)** : __ / __ verts
- **Test D (end-to-end)** : ☐ vert
- **Observations / incidents** : _________________
- **Décision push prod** : ☐ Go / ☐ No-go
- **Signé** : _________________
```

- [ ] **Step 2 : Commit**

```bash
git add docs/tests/2026-05-25-rls-questionnaires-validation.md
git commit -m "docs(questionnaires): procédure d'exécution des migrations Dashboard

Section E enrichie avec :
- E.1 : ordre exact des 3 migrations à exécuter dans Supabase Dashboard
  + commande de vérification pour chacune
- E.2 : estimation de la durée totale de validation (~1h15-1h45)
- E.3 : grille de résultats à remplir au moment de la validation, avec
  décision Go/No-go push prod

Document de référence pour le dev qui exécute le chantier."
```

---

## Task 9 : Validation manuelle exhaustive

**Files:**
- Read-only (exécution)
- Modify: `docs/tests/2026-05-25-rls-questionnaires-validation.md` (section E.3 remplie)

⚠ **Cette tâche se fait après les Tasks 0-8 et nécessite un accès au Supabase Dashboard.**

- [ ] **Step 1 : Exécuter les 3 migrations dans Supabase Dashboard**

Suivre la procédure du document `docs/tests/2026-05-25-rls-questionnaires-validation.md` section E.1.

- [ ] **Step 2 : Exécuter la matrice 39 tests RLS (Section A)**

Cocher chaque test dans le document. Si un test échoue, **STOP** et investiguer avant de continuer.

- [ ] **Step 3 : Exécuter la matrice 7 tests trigger (Section B)**

Cocher chaque test dans le document.

- [ ] **Step 4 : Exécuter les spot checks P0-3 + P0-4 (Section C)**

Pour C3 : `npx vitest run src/lib/services/__tests__/load-evaluation-results.test.ts` → 6 verts.

- [ ] **Step 5 : Exécuter le test end-to-end P0-1 (Section D)**

⚠ **Si D échoue, le chantier ne remplit pas son objectif principal.** Investiguer avant push.

- [ ] **Step 6 : Remplir la section E.3 du document**

Cocher toutes les cases, dater, signer.

- [ ] **Step 7 : Commit le document rempli**

```bash
git add docs/tests/2026-05-25-rls-questionnaires-validation.md
git commit -m "chore(questionnaires): validation manuelle exhaustive — résultats

39 tests RLS + 7 tests trigger + 5 spot checks P0-3/P0-4 + 1 end-to-end P0-1.

Décision Go/No-go documentée en section E.3."
```

---

## Task 10 : Vérification finale acceptance criteria

**Files:** aucun (vérifications uniquement).

- [ ] **Step 1 : Suite Vitest complète**

Run:
```bash
npx vitest run 2>&1 | tail -6
```
Expected: **≥ 495 tests verts** (489 baseline + 6 nouveaux P0-4).

- [ ] **Step 2 : TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1
```
Expected: aucun output.

- [ ] **Step 3 : Build Next.js**

Run:
```bash
npm run build 2>&1 | tail -10
```
Expected: build successful.

- [ ] **Step 4 : Acceptance criteria (spec §8)**

```bash
echo "=== AC1 — Volet A : 12 policies CREATE dans la migration ==="
grep -c "CREATE POLICY" supabase/migrations/fix_questionnaires_rls_strict.sql
# Expected: 12

echo ""
echo "=== AC2 — Volet E : fonction + 2 triggers + backfill ==="
grep -c "CREATE OR REPLACE FUNCTION\|CREATE TRIGGER" supabase/migrations/sync_assignments_to_questionnaire_sessions.sql
# Expected: 3 (1 fonction + 2 triggers)

echo ""
echo "=== AC4 — P0-4 : isCorrect exportée + normalize factorisée ==="
grep -nE "^export function isCorrect|^const normalize" src/lib/services/load-evaluation-results.ts
# Expected: 2 lignes

echo ""
echo "=== AC4 — 6 tests Vitest présents ==="
grep -c "it(" src/lib/services/__tests__/load-evaluation-results.test.ts
# Expected: 6

echo ""
echo "=== AC6 — Validation manuelle marquée Go ==="
grep -A 1 "Décision push prod" docs/tests/2026-05-25-rls-questionnaires-validation.md | tail -1
# Expected: la case Go cochée
```

- [ ] **Step 5 : Récap des commits du chantier**

```bash
git log --oneline main..HEAD
```
Expected: ~8 commits (Task 1, 2, 3, 4, 5 ou skip, 6, 7, 8, 9). Task 0 et 10 n'ont pas de commit (investigation et vérification).

- [ ] **Step 6 : Présenter les options finishing**

Présenter à l'utilisateur les 4 options du skill `superpowers:finishing-a-development-branch` :

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Rappeler :
- **Les 3 migrations SQL ont déjà été exécutées dans Supabase Dashboard** lors de Task 9 — donc la prod a déjà la nouvelle structure RLS + trigger + (optionnel) CHECK constraint.
- **Le push du code est donc safe à enchaîner** (aucune fenêtre de désynchronisation).

---

## Self-review (effectuée pendant la rédaction)

### 1. Spec coverage

| Spec section | Task(s) couvrant |
|---|---|
| §3 (architecture) | Vue d'ensemble du plan en début |
| §4 (Volet A RLS) | Task 1 (migration) + Task 2 (tests doc) + Task 9 (validation) |
| §5 (Volet E trigger) | Task 3 (migration) + Task 4 (tests doc) + Task 9 (validation) |
| §6.1 (P0-3) | Task 0 (investigation) + Task 5 (migration conditionnée) |
| §6.2 (P0-4) | Task 6 (tests TDD failing-first) + Task 7 (fix) + Task 9 (validation) |
| §7 (validation manuelle) | Task 2 (matrice RLS) + Task 4 (matrice trigger + end-to-end) + Task 8 (procédure E.1-E.3) + Task 9 (exécution) |
| §8 (acceptance criteria) | Task 10 (vérification finale) |
| §9 (risques) | Adressés par les sections Validation + procédure d'exécution |
| §11 (ordre d'exécution) | Reflète exactement le plan 11 tasks |

✅ 100% de couverture.

### 2. Placeholder scan

- Aucun "TBD" ou "TODO"
- Aucun "Similar to Task N" sans répétition de code
- Aucun "implement later"
- Task 5 utilise le terme "conditionné à investigation" — c'est explicite et documenté, pas un placeholder

### 3. Type consistency

- `isCorrect(question, userAnswer)` : signature cohérente Task 6 ↔ Task 7
- `normalize(v: unknown): string` : factorisation cohérente
- Noms des migrations SQL : 3 noms distincts (`fix_questionnaires_rls_strict.sql`, `sync_assignments_to_questionnaire_sessions.sql`, `fix_satisfaction_type_enum.sql`) — pas de collision
- Noms de policies : préfixe `fea_` / `fsa_` / `qt_` cohérents (4 policies par table)

✅ Pas de divergence détectée.

---

## Exécution

Plan complete et sauvé à `docs/superpowers/plans/2026-05-25-questionnaires-solidification-p0.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — dispatch d'un subagent par tâche, revue spec compliance + code quality entre chaque, itération rapide (pattern identique aux 5 chantiers précédents).

**2. Inline Execution** — exécution des tâches dans cette session via `executing-plans`, batch execution avec checkpoints.

⚠ **Particularité de ce chantier** : Tasks 1, 3, 5 produisent des migrations SQL qui doivent être **exécutées manuellement dans Supabase Dashboard** par le dev humain (Task 9) avant push prod. Le pattern subagent-driven gère cela très bien (Task 9 dispatch le dev humain ou pause pour validation).

Quelle approche ?
