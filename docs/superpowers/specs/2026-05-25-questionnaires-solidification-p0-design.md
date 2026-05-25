# Solidification Questionnaires — Volet A (RLS) + Volet E (Mirroring) + P0 rapides

> **Chantier 1 sur 2** — focus P0 production. Chantier 2 ultérieur traitera Volets B (type safety) + C (robustesse) + D (UX pilotage) + F (tests étendus) + P0-5 (auto Qualiopi).

**Date :** 2026-05-25
**Branche cible :** `feat/questionnaires-solidification-p0` (depuis `main` post-push `50487c4`)
**Effort estimé :** 18-28h (~1 semaine de dev)
**Pattern :** brainstorming → spec → writing-plans → subagent-driven-development → finishing-a-development-branch (identique aux 5 chantiers précédents)
**Source :** [docs/deep-dive-tab-questionnaires.md](../../deep-dive-tab-questionnaires.md) (commit `50487c4`)

---

## 1. Contexte & objectifs

Le deep-dive BMAD du sous-système Questionnaires (commit `50487c4`) a révélé un **score qualité 3/10 vs 8/10 pour TabConventionDocs post-solidification**, avec **5 bugs P0 bloquants en production**. Le bug pivot (P0-1) est un découplage architectural : `TabQuestionnaires` écrit dans les nouvelles tables `formation_evaluation_assignments` / `formation_satisfaction_assignments` alors que **tous** les consommateurs (PDFs, KPIs Qualiopi, portail learner, auto-send cron) lisent uniquement `questionnaire_sessions`. Conséquence : l'admin qui utilise TabQuestionnaires attribue dans le vide.

Ce chantier vise à **déverrouiller le pilotage** du sous-système en traitant 4 P0 sur 5 (le P0-5 sur les automatisations Qualiopi est reporté car complexe). Il ne touche **aucun consommateur** (pattern Strat 3 trigger SQL de mirroring), ce qui minimise le risque de régression.

---

## 2. Décisions du brainstorming

| Q | Décision | Rationale |
|---|---|---|
| **Q1 — Périmètre** | **Option C** : Chantier 1 = Volets A+E ; Chantier 2 ultérieur = B/C/D/F | A et E sont couplés sur les mêmes 3 tables. Séparer le polish (B/C/D) permet 2 validations manuelles distinctes et réduit le risque diffus. |
| **Q2 — Stratégie refacto Volet E** | **Strat 3** : Trigger SQL de mirroring (uni-directionnel : nouvelles tables → `questionnaire_sessions`) | Le moins risqué (aucun consommateur touché). Trade-off accepté : granularité satisfaction_chaud/froid limitée côté KPIs Qualiopi (générique uniquement). Migration future vers Strat 1 possible. |
| **Q3 — P0-3 + P0-4 inclus** | **Oui aux deux** | Rapides (~2h total), évitent de laisser des bugs P0 en prod pendant le chantier. P0-4 couvert par tests Vitest. |
| **Q3.1 — Audit scoring étendu** | **Oui aux 4 branches** | Audit a révélé bugs latents sur `text/short_answer` (normalisation accents + guard null). À fixer dans le même fichier. |

---

## 3. Architecture vue d'ensemble

Chantier 1 = 4 livrables indépendants groupés en une seule branche :

| # | Livrable | Cible | Effort |
|---|---|---|---|
| 1 | **Volet A** — RLS strictes par rôle | 1 migration SQL `supabase/migrations/fix_questionnaires_rls_strict.sql` : DROP `FOR ALL` + CREATE 4 policies par table sur les 3 tables `formation_evaluation_assignments`, `formation_satisfaction_assignments`, `questionnaire_tokens` | 8-12h |
| 2 | **Volet E** — Trigger PG de mirroring | 1 migration SQL `supabase/migrations/sync_assignments_to_questionnaire_sessions.sql` : fonction PG `sync_assignment_to_questionnaire_sessions()` SECURITY DEFINER + 2 triggers AFTER INSERT/UPDATE/DELETE + backfill SQL one-time | 6-10h |
| 3 | **P0-3** — Aligner enum `satisfaction_entreprise` (conditionné à l'investigation) | 1 migration SQL `ALTER TABLE ... DROP/ADD CONSTRAINT ... CHECK` (si écart confirmé) | 1-2h |
| 4 | **P0-4 + audit scoring** — Fix yes_no + text + 6 tests Vitest | `src/lib/services/load-evaluation-results.ts:58-62` (factoriser `normalize()` + guard null) + nouveau fichier `src/lib/services/__tests__/load-evaluation-results.test.ts` | 2-3h |

**Total estimé : 18-28h.**

**Migrations SQL** : à exécuter manuellement dans Supabase Dashboard **avant** push code (pattern projet existant).

**Hors scope** (Chantier 2 ou futur) :
- Volet B (type safety — 2 casts dans `AdminFillQuestionnaireDialog`)
- Volet C (robustesse — `await onRefresh`, try/catch, toasts manquants)
- Volet D (UX pilotage — vue d'ensemble Qualiopi, filtres apprenants par statut)
- Volet F étendu (couverture tests au-delà de P0-4)
- P0-5 (automatisations Qualiopi sans pièce jointe — complexe : cron + email_queue)
- Bug mineur scoring `multiple_choice` (label vs index — déjà documenté en commentaire)

---

## 4. Volet A — RLS strictes par rôle

### 4.1 — Problème actuel

Vérifié à `supabase/migrations/add-evaluation-tab.sql:25-29` et `add-satisfaction-tab.sql:30-34` :

```sql
CREATE POLICY ... ON formation_evaluation_assignments
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM sessions s
    JOIN profiles p ON p.entity_id = s.entity_id
    WHERE s.id = formation_evaluation_assignments.session_id
  )
);
```

**Faille** : `FOR ALL` couvre SELECT+INSERT+UPDATE+DELETE avec la même condition. La condition vérifie l'entity match (via JOIN profiles) mais **pas le rôle**. Un learner authentifié dans la même entité peut INSERT/UPDATE/DELETE dans `formation_evaluation_assignments` et altérer les attributions de questionnaires de sa propre session.

### 4.2 — Migration `fix_questionnaires_rls_strict.sql`

**Plan haut niveau** (le détail SQL est dans le plan d'implémentation Phase 3) :

1. DROP les policies actuelles `FOR ALL` sur les 3 tables :
   - `formation_evaluation_assignments`
   - `formation_satisfaction_assignments`
   - `questionnaire_tokens`

2. Pour chaque table, CREATE 4 policies distinctes :

   - **SELECT** : autorisé à tout utilisateur authentifié de la même entité (admin/trainer doit voir la liste ; learner ne récupère jamais d'attribution depuis le client — il reçoit le token par email).

   - **INSERT/UPDATE/DELETE** : restreints à `admin` / `super_admin` (vérification jointure `profiles.role`).

### 4.3 — Exemple de pattern (à appliquer aux 3 tables)

```sql
DROP POLICY IF EXISTS "formation_evaluation_assignments_all"
  ON formation_evaluation_assignments;

CREATE POLICY "fea_select" ON formation_evaluation_assignments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
    )
  );

CREATE POLICY "fea_insert_admin" ON formation_evaluation_assignments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN profiles p ON p.id = auth.uid() AND p.entity_id = s.entity_id
      WHERE s.id = formation_evaluation_assignments.session_id
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "fea_update_admin" ON formation_evaluation_assignments
  FOR UPDATE TO authenticated USING (...) WITH CHECK (...);

CREATE POLICY "fea_delete_admin" ON formation_evaluation_assignments
  FOR DELETE TO authenticated USING (...);
```

(Pattern identique pour `formation_satisfaction_assignments` et `questionnaire_tokens`. `questionnaire_tokens` : les opérations publiques `public-submit` passent en `service_role` qui bypass les RLS de toute façon, donc seules les opérations admin sont concernées.)

### 4.4 — Risques

- **Régression bloquante** : très improbable car aucun consommateur ne fait actuellement de mutation depuis le client `learner` ou `trainer`. Validation Section 5 confirme.
- **Latency RLS** : 4 policies vs 1 — chaque query évalue plusieurs conditions. Impact négligeable en pratique (< 1 ms).

### 4.5 — Effort détaillé

| Tâche | Heures |
|---|---|
| Investigation des policies actuelles sur les 3 tables | 1h |
| Rédaction de la migration `fix_questionnaires_rls_strict.sql` | 2h |
| Tests SQL manuels dans Supabase Dashboard (3 rôles × 4 policies × 3 tables = 36 tests) | 3-4h |
| Documentation : commit message détaillé + mention dans CLAUDE.md si nécessaire | 1h |
| Buffer | 1-3h |
| **Total Volet A** | **8-12h** |

---

## 5. Volet E — Trigger PostgreSQL de mirroring

### 5.1 — Migration `sync_assignments_to_questionnaire_sessions.sql`

#### 5.1.1 — Fonction PostgreSQL

```sql
CREATE OR REPLACE FUNCTION sync_assignment_to_questionnaire_sessions()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
    VALUES (NEW.questionnaire_id, NEW.session_id, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Si la paire (q_id, s_id) ne change pas, no-op
    IF OLD.questionnaire_id = NEW.questionnaire_id
       AND OLD.session_id = NEW.session_id THEN
      RETURN NEW;
    END IF;

    -- Sinon : supprimer l'ancien miroir si plus aucune attribution
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

    INSERT INTO questionnaire_sessions (questionnaire_id, session_id, created_at)
    VALUES (NEW.questionnaire_id, NEW.session_id, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (questionnaire_id, session_id) DO NOTHING;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Garder la ligne miroir tant qu'il reste au moins 1 attribution pour ce couple
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
```

#### 5.1.2 — Triggers

```sql
CREATE TRIGGER trg_sync_eval_assignment
  AFTER INSERT OR UPDATE OR DELETE ON formation_evaluation_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_assignment_to_questionnaire_sessions();

CREATE TRIGGER trg_sync_satis_assignment
  AFTER INSERT OR UPDATE OR DELETE ON formation_satisfaction_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_assignment_to_questionnaire_sessions();
```

#### 5.1.3 — Backfill one-time

```sql
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

### 5.2 — Choix de design clés

| # | Choix | Justification |
|---|---|---|
| 1 | Mirroring uni-directionnel (nouvelles → ancienne) | Évite la complexité bi-directionnelle. `/admin/questionnaires/page.tsx` continue d'écrire directement dans `questionnaire_sessions` — ses attributions n'ont pas de counterpart dans les nouvelles tables, mais le trigger ne les affecte pas. |
| 2 | `ON CONFLICT (questionnaire_id, session_id) DO NOTHING` | Empêche double-écriture si une ligne existe déjà (créée via legacy). |
| 3 | Granularité perdue côté miroir | Acceptable car le miroir nourrit des consommateurs qui ne connaissent pas evaluation_type/satisfaction_type. Les nouvelles tables gardent toute la granularité pour TabQuestionnaires. |
| 4 | `SECURITY DEFINER` | Le trigger doit pouvoir écrire dans `questionnaire_sessions` même si l'appelant n'a pas les permissions directes. La fonction est limitée à un upsert/delete sur 1 table connue — pas de risque d'élévation de privilèges. |
| 5 | DELETE conditionnel (NOT EXISTS dans LES DEUX tables) | Important pour le cas où le même questionnaire est attribué via éval ET satisfaction sur la même session — on garde le miroir tant que l'un des deux existe. |
| 6 | UPDATE inclus dans le trigger | Protection forward-compatible. Aujourd'hui TabQuestionnaires ne fait que INSERT/DELETE, mais si demain une feature "modifier l'attribution" est ajoutée, le trigger réagit correctement. |

### 5.3 — Effort détaillé

| Tâche | Heures |
|---|---|
| Rédaction de la migration (fonction + 2 triggers + backfill) | 2h |
| Tests manuels Section 6 (7 cas) | 2-3h |
| Validation end-to-end : attribuer via TabQuestionnaires, générer PDF résultats, vérifier data présente | 1h |
| Documentation : commit + note dans CLAUDE.md sur l'ordre d'exécution des migrations | 1h |
| Buffer | 1-3h |
| **Total Volet E** | **6-10h** |

---

## 6. P0-3 + P0-4 (fixes rapides)

### 6.1 — P0-3 : Aligner enum `satisfaction_entreprise`

**À investiguer en première tâche du plan** : le subagent du deep-dive a rapporté un écart entre l'UI (qui propose `satisfaction_entreprise` dans `TabQuestionnaires.tsx` STAGES) et la CHECK constraint DB. La vérification consiste à :

1. Lister tous les types proposés par l'UI : `grep -E "satisfaction_(chaud|froid|entreprise|...)" src/app/\(dashboard\)/admin/formations/\[id\]/_components/TabQuestionnaires.tsx`
2. Lister la CHECK constraint actuelle : `grep -nA 5 "satisfaction_type CHECK\|satisfaction_type TEXT" supabase/migrations/add-satisfaction-tab.sql`
3. Comparer : si écart confirmé → migration de fix. Si pas d'écart → P0-3 retiré du scope (rapport final).

**Migration (si confirmé)** : `supabase/migrations/fix_satisfaction_type_enum.sql`

```sql
ALTER TABLE formation_satisfaction_assignments
  DROP CONSTRAINT IF EXISTS formation_satisfaction_assignments_satisfaction_type_check;

ALTER TABLE formation_satisfaction_assignments
  ADD CONSTRAINT formation_satisfaction_assignments_satisfaction_type_check
  CHECK (satisfaction_type IN (
    -- Liste exhaustive à compléter après investigation
    'satisfaction_chaud',
    'satisfaction_froid',
    'satisfaction_entreprise'
    -- + autres valeurs UI à confirmer
  ));
```

**Validation** : attribuer via UI un questionnaire `satisfaction_entreprise` → INSERT doit réussir (200 OK). Aujourd'hui : crash silencieux côté admin avec message d'erreur DB.

**Effort** : 1-2h (30 min investigation + 30 min migration + 30 min test).

### 6.2 — P0-4 + audit scoring étendu

#### 6.2.1 — Code actuel buggué

`src/lib/services/load-evaluation-results.ts:55-67` :

```ts
if (question.type === "multiple_choice") {
  return Number(userAnswer) === Number(correct);  // OK (bug mineur label/index laissé Chantier 2)
}
if (question.type === "yes_no" || question.type === "true_false") {
  return Boolean(userAnswer) === Boolean(correct);  // ← P0-4 : Boolean("non") === Boolean("oui") === true
}
if (question.type === "text" || question.type === "short_answer") {
  return String(userAnswer ?? "").trim().toLowerCase() === String(correct).trim().toLowerCase();
  // ↑ Bugs latents :
  //   - String(null) = "null" → si user répond "null", matche faussement
  //   - Pas de normalisation accents : "Élève" ≠ "Eleve"
}
if (question.type === "rating") {
  return null;  // OK
}
```

#### 6.2.2 — Fix factorisé

```ts
/** Normalise une réponse pour comparaison : trim + lowercase + suppression accents. */
const normalize = (v: unknown): string =>
  String(v ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

function isCorrect(question: QuestionRow, userAnswer: unknown): boolean | null {
  const opts = question.options as { correct_answer?: unknown } | null;
  if (!opts || opts.correct_answer === undefined) return null;
  const correct = opts.correct_answer;

  if (question.type === "multiple_choice") {
    return Number(userAnswer) === Number(correct);
  }
  if (question.type === "yes_no" || question.type === "true_false") {
    return normalize(userAnswer) === normalize(correct);  // ← FIX P0-4
  }
  if (question.type === "text" || question.type === "short_answer") {
    if (correct === null || correct === undefined) return null;  // ← FIX guard null
    return normalize(userAnswer) === normalize(correct);  // ← FIX normalisation accents
  }
  if (question.type === "rating") {
    return null;
  }
  return null;
}
```

#### 6.2.3 — Tests régression (6 minimum)

Fichier à créer : `src/lib/services/__tests__/load-evaluation-results.test.ts`

```ts
import { describe, it, expect } from "vitest";
// L'export de isCorrect devra être public pour permettre les tests
// (refactor mineur : exporter la fonction ou la déplacer dans un helper testable)

describe("isCorrect — scoring questionnaire", () => {
  describe("yes_no / true_false (régression P0-4 Boolean bug)", () => {
    it("'oui' vs 'oui' → true", () => { ... });
    it("'non' vs 'oui' → false (régression Boolean('non') === Boolean('oui'))", () => { ... });
    it("'OUI' vs 'oui' → true (case insensitive)", () => { ... });
  });
  describe("text / short_answer", () => {
    it("'élève' vs 'eleve' → true (normalisation accents)", () => { ... });
    it("null user answer vs 'vide' correct → false (pas confusion 'null' string)", () => { ... });
    it("'  Hello  ' vs 'hello' → true (trim)", () => { ... });
  });
});
```

**Effort** : 2-3h (15 min fix + 1-2h tests + 30 min validation manuelle scoring sur 1 session de test).

---

## 7. Validation manuelle

### 7.1 — Matrice Volet A (RLS) — 36 tests

Pour chaque rôle ∈ {`learner`, `trainer`, `admin`} et chaque table ∈ {`formation_evaluation_assignments`, `formation_satisfaction_assignments`, `questionnaire_tokens`} et chaque opération ∈ {`SELECT`, `INSERT`, `UPDATE`, `DELETE`} :

| Rôle | Opération | Attendu |
|---|---|---|
| learner | SELECT | ✓ 200 (même entity) |
| learner | INSERT/UPDATE/DELETE | ✗ 403 |
| trainer | SELECT | ✓ 200 |
| trainer | INSERT/UPDATE/DELETE | ✗ 403 |
| admin | SELECT/INSERT/UPDATE/DELETE | ✓ 200 (entity scoped) |
| admin entité A | SELECT entity B | ✗ 0 rows (RLS) |

**Outil** : Supabase Dashboard SQL Editor avec `SET LOCAL "request.jwt.claims" = '{"sub":"<user_id>"}'`.

### 7.2 — Matrice Volet E (trigger) — 7 tests

| # | Action | `formation_*_assignments` | `questionnaire_sessions` |
|---|---|---|---|
| 1 | INSERT 1 attribution éval | 1 ligne | 1 ligne NEW |
| 2 | DELETE cette attribution | 0 ligne | 0 ligne |
| 3 | INSERT satis chaud + satis froid (même q, même s) | 2 lignes | 1 ligne dédupliquée |
| 4 | DELETE satis chaud | 1 ligne | 1 ligne conservée |
| 5 | DELETE satis froid | 0 ligne | 0 ligne |
| 6 | UPDATE evaluation_type d'une attribution | 1 ligne (modifiée) | 1 ligne (inchangée) |
| 7 | Backfill : data pré-trigger dans nouvelles tables | inchangée | nouvelles lignes mirrorées |

### 7.3 — Spot checks P0-3 + P0-4

- **P0-3** : attribuer un questionnaire `satisfaction_entreprise` via UI → INSERT réussit (200 OK).
- **P0-4 yes_no** : 1 session test, 1 apprenant répond "non" à une question dont correct="oui" → résultat affiché **incorrect**, PDF "Résultats évaluations" cohérent.
- **P0-4 text** : 1 apprenant répond "Élève" vs correct="eleve" → marqué correct (normalisation).

### 7.4 — End-to-end P0-1 (résolution du découplage)

Le test pivot du Chantier 1 :

1. Créer 1 nouvelle session vierge
2. Via TabQuestionnaires, attribuer 1 questionnaire éval + 1 questionnaire satis chaud
3. Vérifier dans Supabase Dashboard : `questionnaire_sessions` contient bien 2 lignes (mirrorées par le trigger)
4. Faire répondre 1 apprenant via le lien public
5. Cliquer "Générer PDF résultats évaluations" dans TabQuestionnaires → le PDF s'ouvre et contient la data ✅
6. Aller dans TabQualiopi → les KPIs comptent bien la réponse ✅

**Si ce flow end-to-end passe, le Chantier 1 a atteint son objectif principal** : déverrouiller le pilotage du sous-système questionnaires.

---

## 8. Acceptance Criteria

### AC1 — Volet A (RLS)
- ✅ Learner ne peut PAS INSERT/UPDATE/DELETE dans les 3 tables
- ✅ Trainer peut SELECT mais pas INSERT/UPDATE/DELETE
- ✅ Admin/super_admin peut tout faire (entité limitée)
- ✅ Cross-tenant bloqué (admin entité A ne voit pas entité B)

### AC2 — Volet E (Trigger)
- ✅ Matrice 7 tests Section 7.2 verte
- ✅ Backfill exécuté : toutes les attributions pré-existantes dans nouvelles tables sont mirrorées
- ✅ **End-to-end Section 7.4 vert** (création session → attribution → réponse apprenant → PDF résultats avec data → KPIs Qualiopi corrects)

### AC3 — P0-3 (conditionné à investigation)
- ✅ Si écart confirmé : `satisfaction_entreprise` peut être inséré sans erreur CHECK
- ✅ Si pas d'écart : AC3 retiré et documenté dans le rapport final

### AC4 — P0-4 + audit scoring étendu
- ✅ 6 tests Vitest verts
- ✅ Spot check yes_no manuel correct
- ✅ Spot check text normalisation accents correct

### AC5 — Qualité générale
- ✅ Suite Vitest verte (489 + 6 = ≥ 495 tests)
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` succès
- ✅ Aucun nouveau cast `as unknown as`, aucun nouveau `console.error` sans toast

### AC6 — Process
- ✅ Branche `feat/questionnaires-solidification-p0` depuis `main`
- ✅ ~5-8 commits granulaires (1 commit = 1 sujet)
- ✅ Migrations SQL exécutées dans Supabase Dashboard **avant** push code
- ✅ Validation manuelle Section 7 passée (matrices + spot checks + end-to-end)

---

## 9. Risques résiduels

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Trigger échoue silencieusement en prod | Faible | Haut (P0-1 non résolu) | Tests Section 7.2 exhaustifs avant push |
| RLS bloquent un cas d'usage non identifié | Faible | Moyen (admin ne peut plus attribuer) | Matrice 36 tests + 1 semaine d'observation post-merge |
| Backfill insère des données incohérentes | Très faible | Moyen | `ON CONFLICT DO NOTHING` empêche double-écriture |
| `SECURITY DEFINER` ouvre une faille | Très faible | Bas | Fonction limitée à upsert/delete sur 1 table — pas de risque d'élévation |
| Investigation P0-3 révèle un écart plus large que prévu | Moyenne | Bas | P0-3 budget 1-2h ; si > 2h, escalader et reporter à Chantier 2 |
| Test scoring révèle d'autres bugs (multiple_choice, rating) | Moyenne | Bas | Documentés en commentaires, reportés à Chantier 2 |

---

## 10. Hors scope (à reporter)

**Chantier 2 (Volets B/C/D/F + P0-5)** :

- **Volet B** — Type safety : retirer les 2 casts `as unknown as` dans `AdminFillQuestionnaireDialog`, durcir les types `Record<string, unknown>`.
- **Volet C** — Robustesse : ajouter `await onRefresh()` (vérifier sites précis), try/catch + toasts sur handlers async, fixer les `console.error` silencieux dans 4 routes API.
- **Volet D** — UX pilotage : ajouter une vue d'ensemble Qualiopi (compteur de questionnaires obligatoires / envoyés / complétés / indicateurs en attente), filtres apprenants par statut de réponse, fix des boutons stubs identifiés.
- **Volet F étendu** — Tests : couvrir le scoring multiple_choice + tests d'intégration trigger SQL + tests end-to-end public-submit.
- **P0-5** — Automatisations Qualiopi : les règles `formation_automation_rules` standard (J-3 / J0 / J+7 / J+30) envoient des emails sans pièce jointe ni lien token. Refactor du cron auto-send pour intégrer la génération de token + insertion du lien dans le corps de l'email.

**Out-of-scope définitif** (ne sera pas traité par ce chantier) :

- Banque de questionnaires `/admin/questionnaires/*` (architecture distincte, chantier dédié à part)
- Portail learner consommation réponses (touche le bundle apprenant, chantier dédié)
- Bug scoring `multiple_choice` label vs index (déjà documenté en commentaire, faible impact, à traiter en Chantier 2 si confirmé en production)

---

## 11. Ordre d'exécution (pour writing-plans)

Le plan d'implémentation va suivre l'ordre :

1. **Task 0** — Baseline + branche + investigations préalables (signer écart P0-3, lister policies actuelles)
2. **Task 1-3** — Volet A : migration RLS + tests Dashboard (36 tests)
3. **Task 4-6** — Volet E : migration trigger + backfill + tests Dashboard (7 tests + end-to-end)
4. **Task 7** — P0-3 (si confirmé) : migration ALTER CHECK
5. **Task 8-9** — P0-4 + audit scoring : refactor `isCorrect()` + 6 tests Vitest
6. **Task 10** — Vérification finale acceptance criteria + suite tests + tsc + build
7. **Task 11** — finishing-a-development-branch (merge local + push prod)

---

## 12. Self-review

(Section ajoutée lors de la self-review post-rédaction.)

- ✅ **Placeholder scan** : aucun "TBD", "TODO", section incomplète. P0-3 explicitement conditionné à investigation (pas un placeholder).
- ✅ **Internal consistency** : Section 4 (Volet A) et Section 5 (Volet E) ne se contredisent pas. La fonction `SECURITY DEFINER` du trigger contourne les RLS strictes du Volet A intentionnellement (point 4 du tableau Section 5.2).
- ✅ **Scope check** : 4 livrables, ~18-28h, focus P0 — taille appropriée pour un seul chantier. Pas de décomposition nécessaire.
- ✅ **Ambiguity check** : P0-3 explicitement marqué "conditionné à investigation". La granularité chaud/froid limitée côté `questionnaire_sessions` est explicitement documentée comme trade-off accepté (Q2).

---

**FIN DU DESIGN**
