# Solidification Questionnaires — Volets B + C + F + bug multiple_choice (Chantier 2a)

> **Chantier 2a sur 2** — focus hygiène technique. Chantier 2b ultérieur traitera Volet D (UX pilotage) + P0-5 (auto Qualiopi).

**Date :** 2026-05-25
**Branche cible :** `feat/questionnaires-solidification-p1` (depuis `main` post-merge Chantier 1 à `b239757`)
**Effort estimé :** 13-19h (~3-4 jours de dev)
**Pattern :** brainstorming → spec → writing-plans → subagent-driven-development → finishing-a-development-branch (identique aux 7 chantiers précédents)
**Source Chantier 1 :** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md](2026-05-25-questionnaires-solidification-p0-design.md)
**Deep-dive :** [docs/deep-dive-tab-questionnaires.md](../../deep-dive-tab-questionnaires.md)

---

## 1. Contexte & objectifs

Le Chantier 1 (mergé à `b239757`) a résolu 4 des 5 P0 identifiés dans le deep-dive : découplage data (P0-1), RLS permissive (P0-2), enum incompatible (P0-3), scoring yes_no/text (P0-4). Score qualité estimé après Chantier 1 : **7/10** (vs 3/10 baseline).

Ce Chantier 2a vise à **nettoyer la dette technique** sans toucher au produit (pas de nouveau bouton, pas de nouvelle UX). Faire monter la qualité à **8/10**. Préparer un terrain propre pour Chantier 2b (UX pilotage Volet D + auto Qualiopi P0-5).

**Bonus important** : pendant l'investigation Volet F, le bug `multiple_choice` (label vs index) est confirmé P0-équivalent — toutes les questions multiple_choice sont actuellement marquées **incorrectes** (faux négatif systématique). Fix inclus dans ce chantier.

---

## 2. Décisions du brainstorming

| Q | Décision | Rationale |
|---|---|---|
| **Q1 — Périmètre Chantier 2** | **Option B** : décomposer en Chantier 2a (B+C+F) + Chantier 2b (D + P0-5) | Volet D produit nécessite cadrage UX dédié. Décomposer = 2 validations distinctes, moins de risque diffus. |
| **Q2 — Bug multiple_choice** | **Inclure dans Chantier 2a** | Confirmé P0-équivalent (faux négatif systématique). Effort ~2-3h, naturel dans le scope F (helper scoring). |
| **Q3 — Niveau Volet F** | **F2 (tests ciblés helpers)** + **coverage check automatisé** | Vitest only en stack. F2 = bon compromis, threshold 100% sur `questionnaire-scoring.ts` ciblé. |

---

## 3. Architecture vue d'ensemble

Chantier 2a = 4 livrables indépendants groupés en une seule branche, **code-only (pas de migration SQL)** :

| # | Livrable | Cible | Effort |
|---|---|---|---|
| 1 | **Volet B — Type safety** | `AdminFillQuestionnaireDialog.tsx` (2 casts) + alignement `questionnaire/[token]/page.tsx` sur `ExpandedQuestion` du helper | 2-3h |
| 2 | **Volet C — Robustesse** | Try/catch + toast sur 6-8 handlers async (TabQuestionnaires + AdminFillQuestionnaireDialog) + audit transverse des 4 routes API pour vérifier qu'elles retournent un JSON `{error: string}` exploitable | 4-6h |
| 3 | **Bug `multiple_choice`** | Investigation préalable structure réelle `question.options` BDD + fix défensif `isCorrect()` (label→index lookup) + 3 tests régression | 2-3h |
| 4 | **Volet F — Tests + coverage** | Install `@vitest/coverage-v8` + config threshold 100% sur `questionnaire-scoring.ts` + 9 nouveaux tests (multiple_choice + rating + default + guards + normalize directs) | 3-4h |

**Total estimé : ~11-16h** (~3-4 jours de dev).

**Pas de migration SQL** (Chantier 1 a fait tout le travail SQL — RLS, trigger, enum). Pas de validation manuelle Dashboard requise. Validation manuelle light : tester l'UI réelle pour vérifier que les toasts d'erreur s'affichent correctement.

**Hors scope Chantier 2a** :
- Volet D (UX pilotage) → Chantier 2b
- P0-5 (auto Qualiopi sans pièce jointe) → Chantier 2b ou ultérieur
- Tests d'intégration trigger SQL → besoin framework Supabase test (hors stack actuel)
- Tests E2E `public-submit` → Playwright non installé (setup lourd)
- Refactor architectural TabQuestionnaires sections/ → 395 LOC, pas justifié
- Refactor `Record<string, unknown>` output `buildResponsesPayload` → payload JSONB hétérogène, typer plus précisément casse la flexibilité

---

## 4. Volet B — Type safety

### 4.1 — Casts identifiés (investigation faite pendant le brainstorming)

**Cast 1** : `src/components/questionnaires/AdminFillQuestionnaireDialog.tsx:91`
```ts
expanded as unknown as BaseQuestion[]
```

**Cast 2** : `src/components/questionnaires/AdminFillQuestionnaireDialog.tsx:145`
```ts
questions as unknown as Parameters<typeof buildResponsesPayload>[1]
```

**Cause** : le local `QuestionData` (lignes 22-34) est plus strictement typé que `BaseQuestion` (du module `expand-objectives-question`) : `type` est une union littérale, `options` est `string[] | null` strict, `questionnaire_id` est optionnel. La compatibilité structurelle n'est donc pas évidente pour TypeScript.

### 4.2 — Fix

Refactor du local `QuestionData` pour qu'il étende `ExpandedQuestion` (importé du helper) :

```ts
import { ExpandedQuestion } from "@/lib/expand-objectives-question";

// Local override pour stricter typing UI tout en restant compatible
type QuestionData = ExpandedQuestion & {
  type: "rating" | "text" | "multiple_choice" | "yes_no" | "program_objectives";
  options: string[] | null;
};
```

Avec cette signature :
- `QuestionData[]` est assignable à `BaseQuestion[]` (héritage structurel) → cast 1 retiré
- `QuestionData[]` est assignable à `ExpandedQuestion[]` → cast 2 retiré
- L'UI peut continuer à utiliser le strict union `type` et la strict typed `options`

### 4.3 — Alignement `questionnaire/[token]/page.tsx`

Le fichier `src/app/questionnaire/[token]/page.tsx` a une 3ème définition locale similaire (lignes 12-20). Alignement sur `ExpandedQuestion` pour cohérence :

```ts
import { ExpandedQuestion } from "@/lib/expand-objectives-question";

type QuestionData = ExpandedQuestion & {
  type: "rating" | "text" | "multiple_choice" | "yes_no" | "program_objectives";
  options: string[] | null;
};
```

### 4.4 — Hors scope Volet B

- **Durcissement `Record<string, unknown>`** (output `buildResponsesPayload`) : payload JSONB hétérogène — typer plus précisément casserait la flexibilité de stockage (différents types de réponses : string, number, boolean, array). Reporté indéfiniment.

### 4.5 — Effort détaillé

| Tâche | Heures |
|---|---|
| Refactor `QuestionData` dans `AdminFillQuestionnaireDialog.tsx` | 1h |
| Alignement `questionnaire/[token]/page.tsx` | 30 min |
| Vérification TS clean + tests passent | 30 min |
| Commit | 15 min |
| **Total Volet B** | **2-3h** |

---

## 5. Volet C — Robustesse

### 5.1 — Sites à protéger (audit fait pendant le brainstorming)

| Site | Fonction | Action async | Priorité |
|---|---|---|---|
| `TabQuestionnaires.tsx:71` | `fetchData` (useCallback) | `Promise.all` sur 4 queries Supabase | P1 |
| `TabQuestionnaires.tsx:202` | `handleAssign` | INSERT dans `formation_*_assignments` | P1 |
| `TabQuestionnaires.tsx:219` | `handleRemove` | DELETE | P1 |
| `TabQuestionnaires.tsx:264, 274` | onClick inline async | Génération QR + copy URL | P2 |
| `AdminFillQuestionnaireDialog.tsx:62` | `loadData` (useCallback) | Fetch existing response via fetch API | P1 |
| `AdminFillQuestionnaireDialog.tsx:132` | `handleSubmit` | POST réponse admin via fetch API | P1 |

**Audit pré-investigation** : aucun de ces handlers n'a actuellement de `try/catch` (vérifié par `grep -c "try.*{"` = 0 dans les 2 fichiers).

### 5.2 — Pattern uniforme

Pour chaque handler async, appliquer le pattern uniforme :

```ts
const handleX = async () => {
  setSaving(true); // si applicable
  try {
    const { error } = await supabase.from(...).insert/update/delete(...);
    if (error) throw error;
    toast({ title: "Action réussie" });
    await onRefresh();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setSaving(false);
  }
};
```

Pour les handlers qui consomment une route API via `fetch()` :

```ts
const res = await fetch("/api/...", { method: "POST", body: JSON.stringify({...}) });
if (!res.ok) {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error ?? `Erreur ${res.status}`);
}
```

### 5.3 — Audit transverse routes API

Vérifier que les 4 routes API consommées par les 2 fichiers UI retournent toujours un JSON `{ error: string }` exploitable :

| Route | Format actuel à vérifier | Action |
|---|---|---|
| `/api/formations/[id]/questionnaire-tokens` | `console.error(...message)` ligne 82 → quel format de retour client ? | Audit + alignement si besoin |
| `/api/questionnaire/public-submit` | `console.error` lignes 134 + 146 | Audit |
| `/api/questionnaires/relaunch` | `console.error` ligne 54 | Audit |
| `/api/admin/questionnaires/fill-for-learner` | `console.error` ligne 116 | Audit |

Si une route retourne autre chose que `{error: string}` (par ex un objet Supabase brut, ou rien), corriger pour uniformiser.

### 5.4 — Effort détaillé

| Tâche | Heures |
|---|---|
| Try/catch + toast sur 4 handlers principaux (P1) | 2h |
| Try/catch + toast sur 2 onClick inline (P2) | 1h |
| Audit transverse 4 routes API + alignement format error | 1-2h |
| Spot check UI (simulation d'erreur sur chaque handler → toast visible) | 30 min |
| Commit | 15 min |
| **Total Volet C** | **4-6h** |

---

## 6. Bug `multiple_choice` (P0-équivalent)

### 6.1 — Le bug confirmé

**Côté frontend** : `q.options.map(opt => <button onClick={() => updateResponse(q.id, opt)}>)` — l'apprenant submit la **label string** (ex: "Paris").
- `src/app/questionnaire/[token]/page.tsx:165`
- `src/components/questionnaires/AdminFillQuestionnaireDialog.tsx:275`

**Côté backend scoring** (`src/lib/services/questionnaire-scoring.ts:isCorrect()`) :
```ts
if (question.type === "multiple_choice") {
  return Number(userAnswer) === Number(correct);
}
```

`correct_answer` est stocké comme **index numérique 0-3** (généré par OpenAI, vu dans `src/lib/services/openai.ts:374,396`). `Number("Paris")` = `NaN`, `Number(0)` = `0`, `NaN === 0` = `false`. **Tous les multiple_choice marqués incorrects** (faux négatif systématique).

### 6.2 — Incertitude sur le format `question.options`

Pendant l'investigation du brainstorming, une incohérence a été détectée :
- Frontend (`questionnaire/[token]/page.tsx:164`) : `q.options.map(opt => ...)` → traite comme `string[]`
- Backend scoring (`questionnaire-scoring.ts`) : `opts.correct_answer` → traite comme `{ correct_answer: ... }`

→ Soit la structure réelle stockée est `{options: [...], correct_answer: N}` et le frontend lit faussement, soit l'inverse. Il faut **investiguer en première tâche du plan** pour confirmer.

### 6.3 — Investigation préalable (Task 0 du plan)

Audit de 2-3 questions multiple_choice réelles en BDD via Supabase Dashboard SQL :

```sql
SELECT id, text, type, options
FROM questions
WHERE type = 'multiple_choice'
LIMIT 3;
```

Documenter le format réel observé. Le fix sera adapté.

### 6.4 — Fix défensif (adapté selon investigation)

Plusieurs formats possibles à gérer dans `isCorrect()` :

```ts
if (question.type === "multiple_choice") {
  const opts = question.options as unknown;
  let choices: string[] = [];
  let correctIdx: number | null = null;

  // Format A : { options: [...], correct_answer: N } (généré OpenAI)
  if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
    const obj = opts as { options?: unknown; choices?: unknown; correct_answer?: unknown };
    const rawChoices = obj.options ?? obj.choices;
    if (Array.isArray(rawChoices) && rawChoices.every(o => typeof o === "string")) {
      choices = rawChoices as string[];
    }
    if (typeof obj.correct_answer === "number") {
      correctIdx = obj.correct_answer;
    }
  }

  // Format B : array de strings direct (legacy ?) — pas d'info pour scorer
  if (Array.isArray(opts) && opts.every(o => typeof o === "string")) {
    return null;  // non scorable sans correct_answer accessible
  }

  if (correctIdx === null) return null;

  // userAnswer label match → résoudre l'index
  if (typeof userAnswer === "string" && choices.length > 0) {
    const userIdx = choices.findIndex(o => normalize(o) === normalize(userAnswer));
    if (userIdx < 0) return false;
    return userIdx === correctIdx;
  }

  // userAnswer index legacy
  if (typeof userAnswer === "number") {
    return userAnswer === correctIdx;
  }

  return null;
}
```

**Note** : l'investigation Task 0 peut révéler un format différent. Le fix sera adapté à la réalité observée.

### 6.5 — Tests régression (3 nouveaux)

```ts
describe("multiple_choice (régression bug label vs index)", () => {
  it("retourne true quand userAnswer label match l'option à correct_answer index", () => {
    const question = {
      id: "q1", type: "multiple_choice",
      options: { options: ["Lyon", "Marseille", "Paris", "Nice"], correct_answer: 2 },
    };
    expect(isCorrect(question, "Paris")).toBe(true);
  });

  it("retourne false quand userAnswer label ne match aucune option", () => {
    const question = {
      id: "q1", type: "multiple_choice",
      options: { options: ["Lyon", "Marseille", "Paris"], correct_answer: 2 },
    };
    expect(isCorrect(question, "Bordeaux")).toBe(false);
  });

  it("retourne true en mode legacy quand userAnswer est l'index numérique", () => {
    const question = {
      id: "q1", type: "multiple_choice",
      options: { options: ["A", "B", "C"], correct_answer: 1 },
    };
    expect(isCorrect(question, 1)).toBe(true);
  });
});
```

### 6.6 — Effort détaillé

| Tâche | Heures |
|---|---|
| Task 0 investigation BDD (Supabase Dashboard) | 30 min |
| Fix défensif `isCorrect()` dans `questionnaire-scoring.ts` | 1h |
| 3 tests régression + vérification | 1h |
| Spot check UI réel | 30 min |
| Commit | 15 min |
| **Total Bug multiple_choice** | **2-3h** |

---

## 7. Volet F — Tests + coverage automatisé

### 7.1 — Couverture actuelle vs cible

Couverture actuelle de `questionnaire-scoring.ts` après Chantier 1 : 6 tests (3 yes_no + 3 text). Branches non testées :

| Branche | Action |
|---|---|
| `multiple_choice` | + 3 tests (Section 6.5) |
| `rating` (return null) | + 1 test |
| Default fallback (return null) | + 1 test (type inconnu / hors enum) |
| Guard `opts.correct_answer === undefined` | + 1 test (options sans correct_answer) |
| Guard `!opts` (options null) | + 1 test |
| `normalize()` helper direct | + 2 tests (input null, input avec espaces multiples) |

**Total : 9 nouveaux tests**. Cible : **100% coverage** sur `src/lib/services/questionnaire-scoring.ts`.

### 7.2 — Coverage automatisé

Installation + config :

```bash
npm install --save-dev @vitest/coverage-v8
```

Mise à jour `vitest.config.ts` :

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Threshold ciblé uniquement sur le helper scoring — pas sur tout le projet
      // (les 45 fichiers de tests existants ne couvrent pas 100% partout).
      include: ["src/lib/services/questionnaire-scoring.ts"],
      thresholds: {
        "src/lib/services/questionnaire-scoring.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

### 7.3 — Effort détaillé

| Tâche | Heures |
|---|---|
| Install `@vitest/coverage-v8` + config | 1h |
| 6 nouveaux tests (hors multiple_choice qui est dans Section 6) | 1h |
| Vérification coverage 100% sur le helper | 30 min |
| Commit | 15 min |
| **Total Volet F** | **3-4h** |

---

## 8. Acceptance Criteria

### AC1 — Volet B (Type safety)
- ✅ `grep -n "as unknown as" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx` → **0 résultat**
- ✅ `QuestionData` local étend `ExpandedQuestion` (importé de `@/lib/expand-objectives-question`)
- ✅ `grep -n "as unknown as" src/app/questionnaire/[token]/page.tsx` → 0 résultat (alignement fait)
- ✅ TypeScript clean après refactor

### AC2 — Volet C (Robustesse)
- ✅ `grep -c "try.*{" src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` → **≥ 6** (au moins 6 try/catch ajoutés)
- ✅ `grep -c "try.*{" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx` → **≥ 2** (loadData + handleSubmit)
- ✅ Audit transverse 4 routes API documenté : toutes retournent `{error: string}` exploitable côté client
- ✅ Spot check manuel : déclencher une erreur (ex: deconnexion réseau) sur chaque handler → toast d'erreur s'affiche

### AC3 — Bug `multiple_choice`
- ✅ Investigation Task 0 documente le format réel de `question.options` en BDD
- ✅ `isCorrect()` gère le format détecté (label→index lookup OU index direct OU null si non-scorable)
- ✅ 3 tests régression Vitest verts : label match, label no match, index legacy
- ✅ Spot check manuel : 1 session test avec 1 apprenant qui répond "Paris" à une question dont correct_answer=2 et options=["Lyon","Marseille","Paris","Nice"] → résultat affiche **correct**

### AC4 — Volet F (Tests + coverage)
- ✅ `@vitest/coverage-v8` installé + configuré dans `vitest.config.ts` avec threshold 100% sur `src/lib/services/questionnaire-scoring.ts`
- ✅ `npx vitest run --coverage` passe le threshold (sinon échec)
- ✅ 9 nouveaux tests verts (3 multiple_choice + 1 rating + 1 default + 1 guard !opts + 1 guard correct_answer undefined + 2 normalize directs)
- ✅ Total tests Vitest : ≥ 509 (500 baseline + 9 nouveaux)

### AC5 — Qualité générale
- ✅ Suite Vitest complète verte
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` succès
- ✅ Aucun nouveau cast `as unknown as` introduit (autre que ceux retirés)
- ✅ Aucun nouveau `console.error` sans gestion utilisateur

### AC6 — Process
- ✅ Branche `feat/questionnaires-solidification-p1` depuis `main`
- ✅ ~7-10 commits granulaires (1 commit = 1 sujet)
- ✅ Aucune migration SQL
- ✅ Validation manuelle légère : test des 6-8 handlers async sur l'UI réelle (toast affichés correctement sur path d'erreur simulé)

---

## 9. Risques résiduels

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Refactor type `QuestionData` casse un autre fichier consommateur | Faible | Bas | `tsc --noEmit` détecte immédiatement |
| Fix multiple_choice basé sur format détecté ne couvre pas un cas legacy | Moyenne | Bas | Fix défensif gère 3 formats + return null par défaut (pas faux positif) |
| Try/catch + toast trop intrusif (toast à chaque erreur réseau temporaire) | Faible | Bas | Pattern uniforme `err instanceof Error ? err.message : "Erreur"` |
| `@vitest/coverage-v8` casse les 45 tests existants | Très faible | Moyen | Threshold ciblé sur 1 fichier seulement, autres tests inchangés |
| Coverage 100% atteignable ? | Moyenne | Bas | Si non, abaisser à 95% reste acceptable (decision à la validation finale) |

---

## 10. Hors scope (Chantier 2b ou ultérieur)

**Chantier 2b (D + P0-5)** :
- **Volet D — UX pilotage** : vue d'ensemble Qualiopi (compteur envoyés / complétés / en attente), filtres apprenants par statut, fix boutons stubs, compteurs par stage
- **P0-5 — Auto Qualiopi** : règles `formation_automation_rules` (J-3 / J0 / J+7 / J+30) qui envoient des emails sans pièce jointe ni lien token. Refactor du cron auto-send pour intégrer la génération de token + lien

**Hors scope définitif** :
- Refactor architectural TabQuestionnaires sections/ (395 LOC, pas justifié)
- Durcissement `Record<string, unknown>` output `buildResponsesPayload` (payload JSONB hétérogène intentionnel)
- Tests d'intégration trigger SQL (besoin Supabase test framework)
- Tests E2E `public-submit` (Playwright non installé)
- Tests sur les services consommateurs (`loadEvaluationResults`, `loadSessionAggregates`) — peut être adressé en chantier de tests dédié

---

## 11. Ordre d'exécution (pour writing-plans)

Le plan d'implémentation va suivre l'ordre :

1. **Task 0** — Baseline + branche + investigation préalable structure `question.options` (Supabase Dashboard SQL)
2. **Task 1** — Volet B : refactor `QuestionData` dans `AdminFillQuestionnaireDialog.tsx` + alignement `questionnaire/[token]/page.tsx`
3. **Task 2** — Volet C : try/catch + toast sur les 6-8 handlers async (1 commit par fichier ou 1 commit groupé)
4. **Task 3** — Volet C : audit transverse 4 routes API + alignement format error
5. **Task 4** — Install `@vitest/coverage-v8` + config threshold + vérif coverage actuelle (6/9 tests)
6. **Task 5** — Bug multiple_choice : 3 tests Vitest failing-first
7. **Task 6** — Bug multiple_choice : fix `isCorrect()` adapté au format détecté en Task 0
8. **Task 7** — Volet F : 6 autres tests (rating, default, guards, normalize directs)
9. **Task 8** — Vérification coverage 100% + ajustement si besoin
10. **Task 9** — Vérification finale acceptance criteria (TS clean, build OK, 509+ tests, coverage threshold)
11. **Task 10** — finishing-a-development-branch (merge local + push prod)

---

## 12. Self-review

(Effectuée post-rédaction.)

- ✅ **Placeholder scan** : aucun "TBD", "TODO", section incomplète. Le format de `question.options` est explicitement marqué "à investiguer en Task 0" — pas un placeholder, c'est une découverte planifiée.
- ✅ **Internal consistency** : les estimations Section 4-7 (2-3 + 4-6 + 2-3 + 3-4 = 11-16h) matchent l'estimation totale Section 3 (11-16h). Effort total chantier (Section 1) écrit "13-19h" — c'est l'enveloppe avec marge pour la coordination et le buffer ; cohérent.
- ✅ **Scope check** : 4 livrables, ~13-19h, code-only — taille appropriée pour un seul chantier. Pas de décomposition nécessaire.
- ✅ **Ambiguity check** : le fix multiple_choice est explicitement marqué "adapté selon investigation Task 0". Les 3 formats possibles sont énumérés (Section 6.4) pour anticiper les cas.

---

**FIN DU DESIGN**
