# Plan d'implémentation — Solidification Questionnaires P1 (Chantier 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nettoyer la dette technique du sous-système Questionnaires (Volets B + C + F + bug `multiple_choice`) sans rien changer côté produit, et amener le helper `questionnaire-scoring.ts` à 100% de couverture testée.

**Architecture:** Code-only (pas de migration SQL). 4 livrables indépendants : (1) Volet B refactor `QuestionData` → extends `ExpandedQuestion` retire 2 casts ; (2) Volet C try/catch + toast sur 6 handlers async + audit transverse 4 routes API ; (3) Bug `multiple_choice` fix `isCorrect()` avec label→index lookup ; (4) Volet F install `@vitest/coverage-v8` + 9 nouveaux tests + threshold 100% sur le helper.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (lecture seule pour Task 0 investigation), Vitest + `@vitest/coverage-v8`.

**Spec source:** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p1-design.md](../specs/2026-05-25-questionnaires-solidification-p1-design.md)
**Deep-dive source:** [docs/deep-dive-tab-questionnaires.md](../../deep-dive-tab-questionnaires.md)
**Chantier 1 source:** [docs/superpowers/specs/2026-05-25-questionnaires-solidification-p0-design.md](../specs/2026-05-25-questionnaires-solidification-p0-design.md) — déjà mergé à `b239757`

**Risque modéré assumé** :
- Bug `multiple_choice` : incertitude sur le format réel `question.options` BDD résolue en Task 0 par investigation Supabase Dashboard
- Coverage threshold 100% sur le helper : si atteignable difficile, abaisser à 95% acceptable (décision en Task 10)

---

## Vue d'ensemble des fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `src/lib/services/__tests__/questionnaire-scoring.test.ts` *(existe déjà depuis Chantier 1, sera enrichi)* | + 9 nouveaux tests (3 multiple_choice + 6 branches non couvertes) |

### Modifiés
| Fichier | Changement |
|---|---|
| `src/components/questionnaires/AdminFillQuestionnaireDialog.tsx` | Volet B : refactor `QuestionData` extends `ExpandedQuestion` retire 2 casts. Volet C : try/catch + toast sur `loadData` + `handleSubmit`. |
| `src/app/questionnaire/[token]/page.tsx` | Volet B : aligner `QuestionData` local sur `ExpandedQuestion`. |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx` | Volet C : try/catch + toast sur 4 handlers (`fetchData`, `handleAssign`, `handleRemove`, onClick inline). |
| `src/lib/services/questionnaire-scoring.ts` | Bug `multiple_choice` : fix `isCorrect()` adapté au format détecté Task 0. |
| `src/app/api/formations/[id]/questionnaire-tokens/route.ts` *(potentiel)* | Volet C audit : aligner format error response si besoin. |
| `src/app/api/questionnaire/public-submit/route.ts` *(potentiel)* | Idem. |
| `src/app/api/questionnaires/relaunch/route.ts` *(potentiel)* | Idem. |
| `src/app/api/admin/questionnaires/fill-for-learner/route.ts` *(potentiel)* | Idem. |
| `package.json` | + `@vitest/coverage-v8` dans devDependencies |
| `vitest.config.ts` | + bloc `coverage` avec threshold 100% ciblé `questionnaire-scoring.ts` |

### Hors du repo
- Investigation Task 0 : 1 requête SQL `SELECT` sur Supabase Dashboard pour confirmer la structure de `question.options`. Lecture seule, aucune modification BDD.

---

## Task 0 : Baseline + branche + investigation préalable `question.options`

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
Expected: branche `main` à commit `e3ebb61` (spec validée), 500 tests verts, TypeScript clean.

- [ ] **Step 2 : Créer la branche**

```bash
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/questionnaires-solidification-p1
```

- [ ] **Step 3 : Investigation `question.options` BDD via Supabase Dashboard**

Demander à Wissam d'exécuter dans Supabase Dashboard SQL Editor :

```sql
SELECT id, text, type, options
FROM questions
WHERE type = 'multiple_choice'
LIMIT 5;
```

Analyser le format de chaque ligne `options` :

- **Format A — Objet avec sous-array `options`** :
  ```json
  {
    "options": ["Lyon", "Marseille", "Paris", "Nice"],
    "correct_answer": 2
  }
  ```
  → Le fix backend doit lire `opts.options` ET `opts.correct_answer`. Le frontend (`q.options.map(...)`) doit en réalité faire `q.options.options.map(...)` ou il y a un mapping intermédiaire.

- **Format B — Array de strings direct** :
  ```json
  ["Lyon", "Marseille", "Paris", "Nice"]
  ```
  → Pas de `correct_answer` dans `options` BDD. Doit être stocké ailleurs (autre colonne ?) — donc `isCorrect()` ne peut pas scorer → retourner `null` (non-scorable).

- **Format C — Mixte** (différentes lignes ont différents formats) : fix défensif doit gérer les 2.

Documenter le résultat dans un commentaire de commit pour Task 8 :
```
[INVESTIGATION] question.options format : <A|B|C avec exemple>
```

Pas de commit nécessaire pour Task 0 — c'est de l'investigation préparatoire.

- [ ] **Step 4 : Vérifier état des fichiers cibles**

Run pour confirmer les casts à retirer (Volet B) :
```bash
grep -n "as unknown as" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx
```
Expected: 2 lignes (lignes 91 et 145 approximatives).

Run pour confirmer l'absence de try/catch (Volet C) :
```bash
grep -c "try.*{" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx' src/components/questionnaires/AdminFillQuestionnaireDialog.tsx 2>&1
```
Expected: 2 fichiers à 0 try/catch.

Run pour confirmer Vitest coverage non installé :
```bash
grep -c "@vitest/coverage" package.json
```
Expected: 0.

---

## Task 1 : Volet B — Refactor `QuestionData` dans `AdminFillQuestionnaireDialog.tsx`

**Files:**
- Modify: `src/components/questionnaires/AdminFillQuestionnaireDialog.tsx`

- [ ] **Step 1 : Lire le type local `QuestionData` actuel**

Run:
```bash
sed -n '22,35p' src/components/questionnaires/AdminFillQuestionnaireDialog.tsx
```
Expected : interface `QuestionData` avec 9 champs (id, questionnaire_id?, text, type, options, is_required, order_index, parent_question_id?, objective_text?).

- [ ] **Step 2 : Lire `ExpandedQuestion` du helper**

Run:
```bash
sed -n '17,32p' src/lib/expand-objectives-question.ts
```
Expected : `BaseQuestion` (7 champs : id, questionnaire_id, text, type, options, is_required, order_index) + `ExpandedQuestion extends BaseQuestion` avec 2 champs optionnels (parent_question_id?, objective_text?).

- [ ] **Step 3 : Appliquer le refactor**

Use Edit tool pour remplacer le bloc actuel `interface QuestionData { ... }` (autour des lignes 22-34) par :

```ts
import { ExpandedQuestion } from "@/lib/expand-objectives-question";

// QuestionData étend ExpandedQuestion du helper pour rester structurellement
// compatible avec expandObjectivesQuestions() et buildResponsesPayload(),
// tout en gardant le strict typing UI (type union, options array).
type QuestionData = Omit<ExpandedQuestion, "type" | "options"> & {
  type: "rating" | "text" | "multiple_choice" | "yes_no" | "program_objectives";
  options: string[] | null;
};
```

L'import doit être ajouté en haut du fichier près des autres imports `@/lib/...`.

- [ ] **Step 4 : Retirer le cast ligne 91**

Avant :
```ts
expanded = expandObjectivesQuestions(
  expanded as unknown as BaseQuestion[],
  sessionData as never
) as QuestionData[];
```

Après :
```ts
expanded = expandObjectivesQuestions(
  expanded,
  sessionData as never
) as QuestionData[];
```

L'import `BaseQuestion` peut être retiré si plus utilisé ailleurs. Vérifier avec `grep -n "BaseQuestion" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx`.

- [ ] **Step 5 : Retirer le cast ligne 145**

Avant :
```ts
const payload = buildResponsesPayload(
  responses,
  questions as unknown as Parameters<typeof buildResponsesPayload>[1]
);
```

Après :
```ts
const payload = buildResponsesPayload(responses, questions);
```

- [ ] **Step 6 : Vérifier TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: aucune erreur.

- [ ] **Step 7 : Vérifier qu'il n'y a plus de cast `as unknown as`**

Run:
```bash
grep -n "as unknown as" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx
```
Expected: 0 résultat.

- [ ] **Step 8 : Commit**

```bash
git add src/components/questionnaires/AdminFillQuestionnaireDialog.tsx
git commit -m "refactor(questionnaires): QuestionData extends ExpandedQuestion (Volet B)

Retire les 2 casts as unknown as dans AdminFillQuestionnaireDialog :
- L.91 : expandObjectivesQuestions(expanded as unknown as BaseQuestion[])
- L.145 : questions as unknown as Parameters<typeof buildResponsesPayload>[1]

Refactor :
type QuestionData = Omit<ExpandedQuestion, 'type' | 'options'> & {
  type: union strict UI ;
  options: string[] | null ;
};

Compatibilité structurelle native avec les helpers du module
expand-objectives-question. Type union et options strict préservés
pour le rendu UI."
```

---

## Task 2 : Volet B alignement — `src/app/questionnaire/[token]/page.tsx`

**Files:**
- Modify: `src/app/questionnaire/[token]/page.tsx`

- [ ] **Step 1 : Lire le type local actuel**

Run:
```bash
sed -n '12,22p' src/app/questionnaire/[token]/page.tsx
```
Expected : interface `QuestionData` similaire à AdminFillQuestionnaireDialog mais avec un nom local.

- [ ] **Step 2 : Appliquer le même refactor que Task 1**

Use Edit tool pour remplacer le bloc actuel `interface QuestionData { ... }` (autour des lignes 12-20) par :

```ts
import { ExpandedQuestion } from "@/lib/expand-objectives-question";

type QuestionData = Omit<ExpandedQuestion, "type" | "options"> & {
  type: "rating" | "text" | "multiple_choice" | "yes_no" | "program_objectives";
  options: string[] | null;
};
```

L'import doit être ajouté en haut du fichier près des autres imports `@/lib/...`. Vérifier qu'il n'est pas déjà importé.

- [ ] **Step 3 : Vérifier qu'il n'y a pas de cast `as unknown as` à retirer**

Run:
```bash
grep -n "as unknown as" src/app/questionnaire/[token]/page.tsx
```
Expected: 0 résultat (le fichier n'avait pas les mêmes casts que AdminFillQuestionnaireDialog).

- [ ] **Step 4 : Vérifier TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: aucune erreur. Si des erreurs apparaissent (typage incompatible avec `q.options.map(...)` ou autre consommateur du `QuestionData` local), ajuster le type union pour matcher exactement les champs consommés.

- [ ] **Step 5 : Vérifier suite Vitest**

Run:
```bash
npx vitest run 2>&1 | tail -3
```
Expected: 500 tests passent (inchangé Task 1+2).

- [ ] **Step 6 : Commit**

```bash
git add src/app/questionnaire/[token]/page.tsx
git commit -m "refactor(questionnaire-public): aligner QuestionData sur ExpandedQuestion (Volet B)

Cohérence avec AdminFillQuestionnaireDialog (Task 1). Le fichier de
submit public utilisait une 3ème définition locale similaire — alignement
sur le helper expand-objectives-question pour DRY et prévenir des
casts futurs."
```

---

## Task 3 : Volet C — Try/catch + toast sur TabQuestionnaires (4 handlers)

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx`

- [ ] **Step 1 : Lire `fetchData` (ligne 71)**

Run:
```bash
sed -n '68,100p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
```
Identifier la structure actuelle du callback (Promise.all sur 4 queries Supabase) — sans try/catch.

- [ ] **Step 2 : Wrapper `fetchData` dans un try/catch**

Use Edit tool. Pattern :

```ts
const fetchData = useCallback(async () => {
  try {
    const [a, b, c, d] = await Promise.all([
      supabase.from(...).select(...),
      supabase.from(...).select(...),
      supabase.from(...).select(...),
      supabase.from(...).select(...),
    ]);
    // ... setQuestionnaires(a.data ?? []) etc.
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur de chargement";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  }
}, [formation.id, supabase, toast]);
```

Adapter à la signature exacte du callback existant. Conserver les dépendances du `useCallback` (la closure de `formation.id` et `supabase` et `toast` si présents).

- [ ] **Step 3 : Wrapper `handleAssign` (ligne 202)**

Pattern :

```ts
const handleAssign = async () => {
  if (!selectedQId) return;
  setSaving(true);
  try {
    const table = item.category === "evaluation"
      ? "formation_evaluation_assignments"
      : "formation_satisfaction_assignments";
    const { error } = await supabase.from(table).insert({ /* ... */ });
    if (error) throw error;
    toast({ title: "Questionnaire attribué" });
    await (onRefresh as () => Promise<void>)();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur d'attribution";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 4 : Wrapper `handleRemove` (ligne 219)**

Pattern :

```ts
const handleRemove = async () => {
  setSaving(true);
  try {
    const table = item.category === "evaluation"
      ? "formation_evaluation_assignments"
      : "formation_satisfaction_assignments";
    const { error } = await supabase.from(table).delete().eq("id", assignmentId);
    if (error) throw error;
    toast({ title: "Attribution retirée" });
    await (onRefresh as () => Promise<void>)();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur de retrait";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 5 : Wrapper les onClick inline (lignes 264, 274)**

Localiser :
```bash
sed -n '260,290p' 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
```

Pour chaque `onClick={async () => { ... }}` qui fait une action Supabase ou fetch :

Avant :
```tsx
<Button onClick={async () => {
  await someAsyncAction();
  toast({ title: "Succès" });
}}>
```

Après :
```tsx
<Button onClick={async () => {
  try {
    await someAsyncAction();
    toast({ title: "Succès" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  }
}}>
```

- [ ] **Step 6 : Vérifier TypeScript + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -3
```
Expected: TS clean, 500 tests verts.

- [ ] **Step 7 : Vérifier qu'il y a maintenant ≥ 4 try/catch dans le fichier**

Run:
```bash
grep -c "try {" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
```
Expected: ≥ 4 (1 fetchData + 1 handleAssign + 1 handleRemove + 1+ onClick inline).

- [ ] **Step 8 : Commit**

```bash
git add 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
git commit -m "fix(tab-questionnaires): try/catch + toast sur 4 handlers async (Volet C)

Wrapper avec gestion d'erreur uniforme :
- fetchData (useCallback) — chargement initial 4 queries Promise.all
- handleAssign — INSERT dans formation_*_assignments
- handleRemove — DELETE
- onClick inline — actions QR / copy URL

Pattern uniforme : err instanceof Error ? err.message : 'Erreur'
+ toast destructive sur le path d'erreur."
```

---

## Task 4 : Volet C — Try/catch + toast sur AdminFillQuestionnaireDialog (2 handlers)

**Files:**
- Modify: `src/components/questionnaires/AdminFillQuestionnaireDialog.tsx`

- [ ] **Step 1 : Wrapper `loadData` (ligne 62)**

Localiser :
```bash
sed -n '58,100p' src/components/questionnaires/AdminFillQuestionnaireDialog.tsx
```

Pattern :

```ts
const loadData = useCallback(async () => {
  setLoading(true);
  try {
    const res = await fetch(`/api/admin/questionnaires/fill-for-learner?questionnaire_id=${...}&learner_id=${...}&session_id=${...}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Erreur ${res.status}`);
    }
    const { data } = await res.json();
    // ... setQuestions, setResponses, etc.
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur de chargement";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setLoading(false);
  }
}, [/* deps */]);
```

Adapter aux variables et déps existantes du callback.

- [ ] **Step 2 : Wrapper `handleSubmit` (ligne 132)**

Pattern :

```ts
const handleSubmit = async () => {
  setSubmitting(true);
  try {
    const payload = buildResponsesPayload(responses, questions);
    const res = await fetch("/api/admin/questionnaires/fill-for-learner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionnaire_id, learner_id, session_id,
        answers: payload,
        fill_mode: fillMode,
        admin_notes: adminNotes,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Erreur ${res.status}`);
    }
    toast({ title: "Réponse enregistrée" });
    if (onSuccess) await onSuccess();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur de soumission";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setSubmitting(false);
  }
};
```

Adapter aux variables existantes (probablement `questionnaire_id`, `learner_id`, etc.).

- [ ] **Step 3 : Vérifier TypeScript + tests**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
npx vitest run 2>&1 | tail -3
```
Expected: TS clean, 500 tests verts.

- [ ] **Step 4 : Vérifier qu'il y a maintenant ≥ 2 try/catch dans le fichier**

Run:
```bash
grep -c "try {" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx
```
Expected: ≥ 2.

- [ ] **Step 5 : Commit**

```bash
git add src/components/questionnaires/AdminFillQuestionnaireDialog.tsx
git commit -m "fix(admin-fill-questionnaire): try/catch + toast sur 2 handlers async (Volet C)

Wrapper avec gestion d'erreur uniforme :
- loadData (useCallback) — fetch existing response via API
- handleSubmit — POST réponse admin via API

Parse de error.json() avec fallback sur res.status si la route ne
retourne pas {error: string} exploitable.

Pattern uniforme : err instanceof Error ? err.message : 'Erreur'
+ toast destructive sur le path d'erreur."
```

---

## Task 5 : Volet C — Audit transverse 4 routes API

**Files:**
- Modify (potentiel): `src/app/api/formations/[id]/questionnaire-tokens/route.ts`
- Modify (potentiel): `src/app/api/questionnaire/public-submit/route.ts`
- Modify (potentiel): `src/app/api/questionnaires/relaunch/route.ts`
- Modify (potentiel): `src/app/api/admin/questionnaires/fill-for-learner/route.ts`

- [ ] **Step 1 : Auditer le format de retour error de chaque route**

Pour chaque des 4 routes, vérifier que chaque `NextResponse.json` qui retourne un statut d'erreur (400/401/403/404/500) inclut un champ `error: string` exploitable.

Run pour chaque route :
```bash
for f in src/app/api/formations/\[id\]/questionnaire-tokens/route.ts \
         src/app/api/questionnaire/public-submit/route.ts \
         src/app/api/questionnaires/relaunch/route.ts \
         src/app/api/admin/questionnaires/fill-for-learner/route.ts ; do
  echo "=== $f ==="
  grep -nE "NextResponse\.json|return.*Response\.json" "$f" | head -10
done
```

Pour chaque ligne identifiée, ouvrir le fichier et vérifier :

- ✅ **Conforme** : `NextResponse.json({ error: "Message clair" }, { status: 400 })`
- ❌ **Non conforme** : `NextResponse.json({ message: "..." })` ou `NextResponse.json({})` ou objet Supabase brut

- [ ] **Step 2 : Aligner si besoin**

Pour chaque cas non conforme détecté, Edit le fichier pour aligner le format.

Exemple de transformation :

Avant :
```ts
return NextResponse.json({ message: "Forbidden" }, { status: 403 });
```

Après :
```ts
return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
```

Avant :
```ts
return NextResponse.json(error, { status: 500 });  // objet Supabase brut
```

Après :
```ts
return NextResponse.json({ error: error.message ?? "Erreur serveur" }, { status: 500 });
```

- [ ] **Step 3 : Vérifier TypeScript + build**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
```
Expected: TS clean.

- [ ] **Step 4 : Spot check manuel (recommandé)**

Sur l'UI réelle :
1. Déclencher une erreur sur AdminFillQuestionnaireDialog (ex: déconnecter Supabase ou erreur volontaire)
2. Vérifier que le toast d'erreur affiche un message significatif (pas "undefined" ni "[object Object]")

- [ ] **Step 5 : Commit**

Si aucun fichier modifié (toutes les routes étaient déjà conformes) :

```bash
git commit --allow-empty -m "audit(api): 4 routes questionnaires retournent {error: string} ✓ (Volet C)

Audit transverse :
- /api/formations/[id]/questionnaire-tokens : conforme
- /api/questionnaire/public-submit : conforme
- /api/questionnaires/relaunch : conforme
- /api/admin/questionnaires/fill-for-learner : conforme

Toutes les routes retournent désormais un JSON {error: string}
exploitable côté client (toast significatif)."
```

Si des fichiers modifiés :

```bash
git add src/app/api/...
git commit -m "fix(api): aligner format error response sur les 4 routes questionnaires (Volet C)

Audit transverse : <N> route(s) ne retournaient pas un format
{error: string} uniforme. Aligner pour que les handlers UI puissent
afficher un toast significatif (vs 'undefined' ou '[object Object]').

Routes alignées : <liste>"
```

---

## Task 6 : Volet F — Install `@vitest/coverage-v8` + config

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1 : Installer la peer dependency**

Run:
```bash
npm install --save-dev @vitest/coverage-v8
```
Expected: package ajouté dans `devDependencies` de `package.json`. Pas d'erreur d'installation.

- [ ] **Step 2 : Vérifier l'installation**

Run:
```bash
grep "@vitest/coverage" package.json
```
Expected: 1 ligne `"@vitest/coverage-v8": "^X.Y.Z"`.

- [ ] **Step 3 : Mettre à jour `vitest.config.ts`**

Use Edit tool pour remplacer le contenu de `vitest.config.ts` par :

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
      // Threshold ciblé uniquement sur le helper scoring — pas sur tout le
      // projet (les 45 fichiers de tests existants ne couvrent pas 100%
      // partout, le threshold global casserait la suite).
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 4 : Vérifier que la suite normale fonctionne toujours**

Run:
```bash
npx vitest run 2>&1 | tail -5
```
Expected: 500 tests verts (la config coverage ne perturbe pas la run normale).

- [ ] **Step 5 : Vérifier le coverage actuel (devrait échouer le threshold)**

Run:
```bash
npx vitest run --coverage 2>&1 | tail -20
```
Expected : la suite passe mais le **threshold 100% échoue** car `questionnaire-scoring.ts` n'a actuellement que 6 tests (branche `multiple_choice`, `rating`, default, guards non couverts). Le rapport coverage affiche le pourcentage actuel (~60-70% estimé).

C'est attendu — Tasks 7-9 vont amener la couverture à 100%.

- [ ] **Step 6 : Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "feat(tests): install @vitest/coverage-v8 + threshold 100% questionnaire-scoring (Volet F)

Threshold ciblé uniquement sur src/lib/services/questionnaire-scoring.ts —
pas sur tout le projet (les 45 fichiers de tests existants ne couvrent
pas 100% partout, un threshold global casserait la suite).

Le helper scoring est le seul fichier critique nécessitant 100% de
couverture régression (cf P0-4 Chantier 1 qui aurait été détecté par
un test, et bug multiple_choice à fixer par Task 8).

Tasks 7-9 vont amener la couverture du helper à 100%."
```

---

## Task 7 : Bug `multiple_choice` — Tests Vitest FAILING-FIRST (TDD red phase)

**Files:**
- Modify: `src/lib/services/__tests__/questionnaire-scoring.test.ts`

- [ ] **Step 1 : Ajouter les 3 tests régression multiple_choice**

Use Edit tool pour ajouter à la fin du fichier `src/lib/services/__tests__/questionnaire-scoring.test.ts` (avant le `});` final qui ferme le `describe` principal — vérifier la structure actuelle d'abord) :

```ts
  describe("multiple_choice (régression bug label vs index)", () => {
    it("retourne true quand userAnswer label match l'option à correct_answer index", () => {
      // Format détecté en Task 0 : { options: [...], correct_answer: N }
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["Lyon", "Marseille", "Paris", "Nice"], correct_answer: 2 },
      };
      expect(isCorrect(question, "Paris")).toBe(true);
    });

    it("retourne false quand userAnswer label ne match aucune option", () => {
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["Lyon", "Marseille", "Paris"], correct_answer: 2 },
      };
      expect(isCorrect(question, "Bordeaux")).toBe(false);
    });

    it("retourne true en mode legacy quand userAnswer est l'index numérique", () => {
      const question = {
        id: "q1",
        type: "multiple_choice",
        options: { options: ["A", "B", "C"], correct_answer: 1 },
      };
      expect(isCorrect(question, 1)).toBe(true);
    });
  });
```

Note : adapter la structure de `options` selon le format réel détecté en Task 0. Les 3 tests ci-dessus assument **Format A** (objet `{options, correct_answer}`). Si **Format B** (array direct), changer les tests pour refléter le format réel.

- [ ] **Step 2 : Vérifier que les 3 tests échouent (TDD red phase)**

Run:
```bash
npx vitest run src/lib/services/__tests__/questionnaire-scoring.test.ts 2>&1 | tail -10
```
Expected : **3 tests failed** avec messages d'erreur. L'erreur exacte dépend de l'implémentation actuelle :
- `Number("Paris") === Number(correct)` → `NaN === N` → `false` → test 1 échoue car attendu `true`
- Test 2 attend `false` mais peut-être qu'il passe déjà (faux positif)
- Test 3 attend `true` mais avec `userAnswer = 1` (number), `Number(1) === Number(correct.correct_answer)` peut passer ou échouer selon le format

Documenter exactement quel test échoue et pourquoi pour valider la red phase TDD.

- [ ] **Step 3 : Commit (tests failing)**

```bash
git add src/lib/services/__tests__/questionnaire-scoring.test.ts
git commit -m "test(scoring): 3 tests Vitest régression multiple_choice (failing first)

Tests régression bug P0-équivalent : userAnswer label vs correct_answer
index dans questionnaire-scoring.ts:isCorrect().

3 tests :
- label match : 'Paris' vs options[2] === correct → true
- label no match : 'Bordeaux' vs options non incluant → false
- index legacy : userAnswer numérique (back-compat)

Format options assumé selon Task 0 Investigation : <Format A|B|C>.

Task 8 va adapter isCorrect() pour passer ces tests."
```

---

## Task 8 : Bug `multiple_choice` — Fix `isCorrect()` (TDD green phase)

**Files:**
- Modify: `src/lib/services/questionnaire-scoring.ts`

- [ ] **Step 1 : Lire le code actuel de la branche `multiple_choice`**

Run:
```bash
grep -nA 6 'multiple_choice' src/lib/services/questionnaire-scoring.ts
```
Expected : lignes ~17-19 :
```ts
if (question.type === "multiple_choice") {
  return Number(userAnswer) === Number(correct);
}
```

- [ ] **Step 2 : Appliquer le fix défensif**

Use Edit tool pour remplacer la branche `multiple_choice` actuelle par :

```ts
  if (question.type === "multiple_choice") {
    // Fix bug label vs index : le frontend submit la label string mais
    // correct_answer est stocké comme index numérique (format OpenAI).
    // → résoudre l'index via question.options.options.findIndex(label).
    const opts = question.options as unknown;
    let choices: string[] = [];
    let correctIdx: number | null = null;

    // Format A (généré OpenAI) : { options: [...], correct_answer: N }
    if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
      const obj = opts as { options?: unknown; choices?: unknown; correct_answer?: unknown };
      const rawChoices = obj.options ?? obj.choices;
      if (Array.isArray(rawChoices) && rawChoices.every((o) => typeof o === "string")) {
        choices = rawChoices as string[];
      }
      if (typeof obj.correct_answer === "number") {
        correctIdx = obj.correct_answer;
      }
    }

    // Format B (legacy ?) : array de strings direct, pas de correct_answer
    if (Array.isArray(opts) && opts.every((o) => typeof o === "string")) {
      return null; // non scorable sans correct_answer accessible
    }

    if (correctIdx === null) return null;

    // userAnswer = label string → résoudre l'index via choices
    if (typeof userAnswer === "string" && choices.length > 0) {
      const userIdx = choices.findIndex((o) => normalize(o) === normalize(userAnswer));
      if (userIdx < 0) return false;
      return userIdx === correctIdx;
    }

    // userAnswer = index numérique (legacy ou test)
    if (typeof userAnswer === "number") {
      return userAnswer === correctIdx;
    }

    return null;
  }
```

Note : si Task 0 a révélé un **Format différent**, adapter le code pour matcher la structure réelle.

- [ ] **Step 3 : Vérifier que les 3 tests régression passent (TDD green phase)**

Run:
```bash
npx vitest run src/lib/services/__tests__/questionnaire-scoring.test.ts 2>&1 | tail -10
```
Expected : **9 tests verts** (6 baseline + 3 nouveaux multiple_choice).

- [ ] **Step 4 : Vérifier la suite complète + TS**

Run:
```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit 2>&1 | head -5
```
Expected : 503 tests verts (500 baseline + 3 nouveaux), TS clean.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/services/questionnaire-scoring.ts
git commit -m "fix(scoring): isCorrect() multiple_choice label→index lookup (P0-équivalent)

Le frontend submit la label string (q.options.map(opt => button(opt)))
mais correct_answer est stocké comme index numérique (format OpenAI).

Avant : Number('Paris') === Number(N) === NaN === false →
TOUTES les multiple_choice marquées incorrectes (faux négatif systématique).

Après : fix défensif qui gère 3 formats :
- Format A : { options: [...], correct_answer: N } → label findIndex
- Format B : array direct sans correct_answer → null (non scorable)
- Legacy : userAnswer = index numérique → comparaison directe

Format détecté en Task 0 Investigation : <Format réel>.

3 tests régression Vitest (Task 7) passent."
```

---

## Task 9 : Volet F — 6 autres tests + vérification coverage 100%

**Files:**
- Modify: `src/lib/services/__tests__/questionnaire-scoring.test.ts`

- [ ] **Step 1 : Identifier les branches non couvertes**

Run le coverage pour voir l'état actuel :
```bash
npx vitest run --coverage 2>&1 | tail -20
```

Identifier les branches non couvertes du fichier `questionnaire-scoring.ts`. À ce stade, les branches couvertes sont :
- ✅ `yes_no` (3 tests Chantier 1)
- ✅ `text` (3 tests Chantier 1)
- ✅ `multiple_choice` (3 tests Task 7-8)

Branches à couvrir avec les 6 nouveaux tests :
- `rating` (return null)
- Default fallback (type inconnu)
- Guard `!opts` (options null)
- Guard `opts.correct_answer === undefined`
- `normalize()` helper appelé directement (input null/undefined → "")
- `normalize()` helper appelé directement (input avec espaces multiples → trim + lowercase + accents)

- [ ] **Step 2 : Ajouter les 6 tests**

Use Edit tool pour ajouter à la fin du fichier (avant `});` final) :

```ts
  describe("autres branches scoring", () => {
    it("retourne null pour le type 'rating' (non scorable)", () => {
      const question = {
        id: "q1",
        type: "rating",
        options: { correct_answer: 5 },
      };
      expect(isCorrect(question, 4)).toBe(null);
    });

    it("retourne null pour un type inconnu (default fallback)", () => {
      const question = {
        id: "q1",
        type: "type_inexistant",
        options: { correct_answer: "x" },
      };
      expect(isCorrect(question, "x")).toBe(null);
    });

    it("retourne null quand options est null (pas de scoring possible)", () => {
      const question = {
        id: "q1",
        type: "yes_no",
        options: null,
      };
      expect(isCorrect(question, "oui")).toBe(null);
    });

    it("retourne null quand opts.correct_answer est undefined", () => {
      const question = {
        id: "q1",
        type: "yes_no",
        options: {},  // pas de correct_answer
      };
      expect(isCorrect(question, "oui")).toBe(null);
    });
  });

  describe("normalize() helper (tests directs)", () => {
    it("normalise input null/undefined en chaîne vide", () => {
      expect(normalize(null)).toBe("");
      expect(normalize(undefined)).toBe("");
    });

    it("normalise espaces multiples + casse + accents", () => {
      expect(normalize("  Élève  ")).toBe("eleve");
      expect(normalize("CAFÉ")).toBe("cafe");
    });
  });
```

L'import de `normalize` doit être ajouté en haut du fichier si pas déjà présent :
```ts
import { isCorrect, normalize } from "@/lib/services/questionnaire-scoring";
```

- [ ] **Step 3 : Vérifier que les 6 tests passent**

Run:
```bash
npx vitest run src/lib/services/__tests__/questionnaire-scoring.test.ts 2>&1 | tail -10
```
Expected : **15 tests verts** (6 baseline + 3 multiple_choice + 6 nouveaux).

- [ ] **Step 4 : Vérifier coverage 100%**

Run:
```bash
npx vitest run --coverage 2>&1 | tail -25
```
Expected : `questionnaire-scoring.ts` affiche **100% statements / branches / functions / lines**. Le threshold de la config est respecté → suite verte.

**Si coverage < 100%** : analyser le rapport pour identifier les branches non couvertes, ajouter 1-2 tests supplémentaires.

**Si coverage atteignable difficile (par ex < 95% car certaines branches sont mort code)** : abaisser le threshold à 95% dans `vitest.config.ts` et documenter dans le commit pourquoi.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/services/__tests__/questionnaire-scoring.test.ts
git commit -m "test(scoring): 6 tests pour amener questionnaire-scoring à 100% coverage (Volet F)

Branches précédemment non couvertes :
- rating (return null)
- default fallback (type inconnu)
- guard !opts (options null)
- guard opts.correct_answer === undefined
- normalize() helper direct (null/undefined input)
- normalize() helper direct (espaces multiples + accents)

Total questionnaire-scoring.test.ts : 15 tests (6 P0-4 Chantier 1
+ 3 multiple_choice + 6 branches non couvertes).

Coverage threshold 100% sur le helper passe en CI (npx vitest run --coverage)."
```

---

## Task 10 : Vérification finale acceptance criteria

**Files:** aucun (vérifications uniquement).

- [ ] **Step 1 : Suite Vitest complète**

Run:
```bash
npx vitest run 2>&1 | tail -6
```
Expected: **≥ 509 tests verts** (500 baseline + 9 nouveaux).

- [ ] **Step 2 : Coverage threshold passe**

Run:
```bash
npx vitest run --coverage 2>&1 | tail -25
```
Expected: la suite passe ET le threshold sur `questionnaire-scoring.ts` est respecté (100% ou 95% selon décision Task 9 Step 4).

- [ ] **Step 3 : TypeScript clean**

Run:
```bash
npx tsc --noEmit 2>&1
```
Expected: aucun output.

- [ ] **Step 4 : Build Next.js**

Run:
```bash
npm run build 2>&1 | tail -10
```
Expected: build successful.

- [ ] **Step 5 : Acceptance criteria (spec §8)**

```bash
echo "=== AC1 — Volet B : 0 cast as unknown as ==="
grep -n "as unknown as" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx || echo "(0 - OK)"
grep -n "as unknown as" src/app/questionnaire/[token]/page.tsx || echo "(0 - OK)"

echo ""
echo "=== AC2 — Volet C : try/catch dans TabQuestionnaires + AdminFill ==="
grep -c "try {" 'src/app/(dashboard)/admin/formations/[id]/_components/TabQuestionnaires.tsx'
grep -c "try {" src/components/questionnaires/AdminFillQuestionnaireDialog.tsx

echo ""
echo "=== AC4 — coverage installé + tests ==="
grep "@vitest/coverage-v8" package.json
grep -c "it(" src/lib/services/__tests__/questionnaire-scoring.test.ts

echo ""
echo "=== AC6 — Récap commits ==="
git log --oneline main..HEAD
```

- [ ] **Step 6 : Spot check manuel UI (recommandé)**

Sur l'UI réelle :
1. Ouvrir `/admin/formations/<f_id>` → onglet "Questionnaires"
2. Tenter d'attribuer un questionnaire avec une erreur volontaire (ex: déconnecter Supabase ou modifier le bouton temporairement) → vérifier qu'un toast d'erreur s'affiche avec un message significatif
3. Ouvrir le dialog admin de saisie pour un apprenant → tenter de soumettre → vérifier le toast d'erreur si la route plante

Note : pas de Dashboard Supabase nécessaire pour cette validation (vs Chantier 1 qui requérait la matrice 52 tests).

- [ ] **Step 7 : Présenter les options finishing**

Présenter à l'utilisateur les 4 options du skill `superpowers:finishing-a-development-branch` :

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Rappeler :
- Pas de migration SQL pour ce chantier
- Validation manuelle légère (toast UI) — pas de Dashboard
- Pattern habituel : merge local + push prod

---

## Self-review (effectuée pendant la rédaction)

### 1. Spec coverage

| Spec section | Task(s) couvrant |
|---|---|
| §3 (architecture) | Vue d'ensemble du plan en début |
| §4 (Volet B) | Task 1 (cast 1+2 AdminFill) + Task 2 (alignement public-submit) |
| §5 (Volet C) | Task 3 (TabQuestionnaires) + Task 4 (AdminFillQuestionnaireDialog) + Task 5 (audit transverse routes API) |
| §6 (bug multiple_choice) | Task 0 (investigation) + Task 7 (tests failing-first) + Task 8 (fix) |
| §7 (Volet F + coverage) | Task 6 (install + config) + Task 9 (6 autres tests + vérif 100%) |
| §8 (acceptance criteria) | Task 10 (vérification finale) |
| §9 (risques) | Adressés par investigation Task 0 + fix défensif Task 8 + fallback threshold 95% Task 9 |
| §11 (ordre d'exécution) | Reflète exactement le plan 11 tâches |

✅ 100% de couverture.

### 2. Placeholder scan

- Aucun "TBD" ou "TODO"
- Aucun "Similar to Task N" sans répétition de code
- Aucun "implement later"
- Task 0 "Format réel détecté en Task 0" est documenté comme une découverte — pas un placeholder ; les 3 formats possibles sont énumérés (A, B, C) avec instructions pour adapter le fix Task 8

### 3. Type consistency

- `QuestionData` : signature cohérente Task 1 ↔ Task 2 (même `Omit<ExpandedQuestion, "type" | "options"> & {...}`)
- `isCorrect(question, userAnswer)` : signature cohérente Task 7 (tests) ↔ Task 8 (fix)
- `normalize(v: unknown): string` : helper consommé directement en Task 9 (test direct) — import à ajouter (mentionné explicitement Task 9 Step 2)
- `vitest.config.ts` : threshold 100% sur `questionnaire-scoring.ts` Task 6 + vérification Task 9-10

✅ Pas de divergence détectée.

---

## Exécution

Plan complete et sauvé à `docs/superpowers/plans/2026-05-25-questionnaires-solidification-p1.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — dispatch d'un subagent par tâche, revue spec compliance + code quality entre chaque, itération rapide (pattern identique aux 7 chantiers précédents).

**2. Inline Execution** — exécution des tâches dans cette session via `executing-plans`, batch execution avec checkpoints.

⚠ **Particularité de ce chantier** : Task 0 nécessite une investigation Supabase Dashboard manuelle (1 requête SELECT) pour confirmer le format `question.options` avant que Task 8 ne puisse écrire le bon fix. Le subagent qui exécute Task 0 va devoir s'arrêter et demander à Wissam d'exécuter la requête.

Quelle approche ?
