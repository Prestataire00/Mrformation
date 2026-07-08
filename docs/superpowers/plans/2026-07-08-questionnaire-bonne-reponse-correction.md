# Bonne réponse + correction automatique QCM/oui-non — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de définir la bonne réponse d'une question QCM/oui-non à la création d'un questionnaire (admin + formateur) pour activer la correction automatique existante.

**Architecture:** Nouvelle colonne `questions.correct_answer` (QCM = texte de la bonne option ; oui/non = `"oui"`/`"non"`). Le service de scoring existant (`questionnaire-scoring.ts`) lit cette colonne (repli sur l'ancien format `options.correct_answer` pour les questions générées par IA). Les éditeurs admin et formateur gagnent une saisie de bonne réponse (masquée pour les questionnaires de satisfaction). L'affichage des scores existe déjà.

**Tech Stack:** Next.js 14 (App Router, TS strict), Supabase (Postgres/JSONB), React Hook Form/Shadcn, Vitest. Barrières : `npx tsc --noEmit` + `npx vitest run` (lint ESLint 9 cassé, ne pas utiliser).

**Spec :** `docs/superpowers/specs/2026-07-08-questionnaire-bonne-reponse-correction-design.md`

---

## File Structure

- **Create** `supabase/migrations/add_questions_correct_answer.sql` — colonne `correct_answer`.
- **Modify** `src/lib/services/questionnaire-scoring.ts` — `QuestionRow.correct_answer` + `isCorrect` lit la nouvelle colonne (repli legacy).
- **Create** `src/lib/services/__tests__/questionnaire-scoring-correct-answer.test.ts` — tests scoring.
- **Modify** `src/app/(dashboard)/admin/questionnaires/page.tsx` — form + UI + save.
- **Modify** `src/components/trainer/TrainerQuestionnaireBuilder.tsx` — type + UI + payload.
- **Modify** `src/app/api/trainer/questionnaires/route.ts` (POST) et `src/app/api/trainer/questionnaires/[id]/route.ts` (PUT) — persister `correct_answer`.
- **Modify** `src/app/(dashboard)/trainer/questionnaires/[id]/edit/page.tsx` — charger `correct_answer`.

---

### Task 1: Migration colonne `correct_answer`

**Files:**
- Create: `supabase/migrations/add_questions_correct_answer.sql`

- [ ] **Step 1: Créer le fichier de migration**

```sql
-- ============================================================
-- Ajoute la bonne réponse aux questions de questionnaire, pour
-- activer la correction automatique (QCM / oui-non).
--
-- Convention de stockage (JSONB) :
--   - multiple_choice : le TEXTE de la bonne option (string), ex. "Paris".
--   - yes_no          : "oui" ou "non".
--   - NULL            : question non notée (exclue du score).
--
-- `options` reste un tableau de choix (inchangé). Aucune nouvelle policy RLS
-- (ajout de colonne sur table existante déjà en RLS).
-- ⚠️ À jouer dans Supabase AVANT le push (convention repo).
-- ============================================================

ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer JSONB;
```

- [ ] **Step 2: Jouer la migration en prod (manuel)**

Coller le SQL ci-dessus dans Supabase Dashboard → SQL Editor → Run.
Vérifier : `SELECT column_name FROM information_schema.columns WHERE table_name='questions' AND column_name='correct_answer';` → 1 ligne.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/add_questions_correct_answer.sql
git commit -m "feat(questionnaires): migration questions.correct_answer"
```

---

### Task 2: Scoring lit `question.correct_answer` (repli legacy)

**Files:**
- Modify: `src/lib/services/questionnaire-scoring.ts`
- Test: `src/lib/services/__tests__/questionnaire-scoring-correct-answer.test.ts`

- [ ] **Step 1: Écrire les tests (échouants)**

Créer `src/lib/services/__tests__/questionnaire-scoring-correct-answer.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { isCorrect, computeResponseScore } from "@/lib/services/questionnaire-scoring";

describe("isCorrect — nouvelle colonne correct_answer", () => {
  it("QCM par texte d'option : bonne réponse", () => {
    const q = { id: "q1", type: "multiple_choice", options: ["Lyon", "Paris", "Nice"], correct_answer: "Paris" };
    expect(isCorrect(q, "Paris")).toBe(true);
    expect(isCorrect(q, "Lyon")).toBe(false);
  });

  it("QCM insensible à la casse/accents", () => {
    const q = { id: "q1", type: "multiple_choice", options: ["Éléphant", "Chat"], correct_answer: "Éléphant" };
    expect(isCorrect(q, "elephant")).toBe(true);
  });

  it("oui/non : bonne réponse", () => {
    const q = { id: "q2", type: "yes_no", options: null, correct_answer: "oui" };
    expect(isCorrect(q, "oui")).toBe(true);
    expect(isCorrect(q, "non")).toBe(false);
  });

  it("sans correct_answer → non scorable (null)", () => {
    const q = { id: "q3", type: "multiple_choice", options: ["A", "B"], correct_answer: null };
    expect(isCorrect(q, "A")).toBe(null);
  });

  it("legacy : format objet options.correct_answer (index) reste supporté", () => {
    const q = { id: "q4", type: "multiple_choice", options: { options: ["A", "B", "C"], correct_answer: 1 } };
    expect(isCorrect(q, "B")).toBe(true);
    expect(isCorrect(q, "A")).toBe(false);
  });
});

describe("computeResponseScore — total_scorable", () => {
  it("compte les questions avec la nouvelle colonne, ignore les non notées", () => {
    const questions = [
      { id: "q1", type: "multiple_choice", options: ["A", "B"], correct_answer: "A" },
      { id: "q2", type: "yes_no", options: null, correct_answer: "non" },
      { id: "q3", type: "rating", options: null, correct_answer: null },
    ];
    const res = computeResponseScore({ q1: "A", q2: "oui", q3: "5" }, questions);
    expect(res.total_scorable).toBe(2);
    expect(res.correct).toBe(1);
    expect(res.score_percent).toBe(50);
  });

  it("questionnaire 100% satisfaction (aucune correct_answer) → score_percent null", () => {
    const questions = [{ id: "q1", type: "rating", options: null, correct_answer: null }];
    const res = computeResponseScore({ q1: "5" }, questions);
    expect(res.score_percent).toBe(null);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run src/lib/services/__tests__/questionnaire-scoring-correct-answer.test.ts`
Expected: FAIL (le champ `correct_answer` n'est pas encore lu par `isCorrect` → QCM par texte renvoie `null`).

- [ ] **Step 3: Étendre `QuestionRow`**

Dans `src/lib/services/questionnaire-scoring.ts`, remplacer :

```ts
export interface QuestionRow {
  id: string;
  type: string;
  options: unknown;
}
```

par :

```ts
export interface QuestionRow {
  id: string;
  type: string;
  options: unknown;
  /** Bonne réponse (colonne dédiée) : texte d'option (QCM) ou "oui"/"non". */
  correct_answer?: unknown;
}
```

- [ ] **Step 4: Réécrire `isCorrect`**

Remplacer tout le corps de la fonction `isCorrect` (de `const opts = question.options ...` jusqu'à son `}` final) par :

```ts
  // Bonne réponse : colonne dédiée en priorité, repli sur l'ancien format objet
  // options.correct_answer (questions générées par IA, index numérique).
  const legacyOpts = question.options as { correct_answer?: unknown } | null;
  const correct =
    question.correct_answer !== undefined && question.correct_answer !== null
      ? question.correct_answer
      : (legacyOpts && typeof legacyOpts === "object" && !Array.isArray(legacyOpts)
          ? legacyOpts.correct_answer
          : undefined);
  if (correct === undefined || correct === null) return null; // pas scorable

  if (question.type === "multiple_choice") {
    // Nouveau format : correct = texte de la bonne option (string).
    if (typeof correct === "string") {
      return normalize(userAnswer) === normalize(correct);
    }
    // Legacy : correct = index numérique. Résoudre label→index via les choix.
    let choices: string[] = [];
    const opts = question.options as unknown;
    if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
      const obj = opts as { options?: unknown; choices?: unknown };
      const rawChoices = obj.options ?? obj.choices;
      if (Array.isArray(rawChoices) && rawChoices.every((o) => typeof o === "string")) {
        choices = rawChoices as string[];
      }
    } else if (Array.isArray(opts) && opts.every((o) => typeof o === "string")) {
      choices = opts as string[];
    }
    const correctIdx = typeof correct === "number" ? correct : null;
    if (correctIdx === null) return null;
    if (typeof userAnswer === "string" && choices.length > 0) {
      const userIdx = choices.findIndex((o) => normalize(o) === normalize(userAnswer));
      if (userIdx < 0) return false;
      return userIdx === correctIdx;
    }
    if (typeof userAnswer === "number") return userAnswer === correctIdx;
    return null;
  }
  if (question.type === "yes_no" || question.type === "true_false") {
    return normalize(userAnswer) === normalize(correct);
  }
  if (question.type === "text" || question.type === "short_answer") {
    return normalize(userAnswer) === normalize(correct);
  }
  if (question.type === "rating") {
    return null;
  }
  return null;
```

- [ ] **Step 5: Lancer les tests (nouveaux + existants du service)**

Run: `npx vitest run src/lib/services/__tests__/questionnaire-scoring-correct-answer.test.ts && npx vitest run -t "scoring"`
Expected: PASS. Puis `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/questionnaire-scoring.ts src/lib/services/__tests__/questionnaire-scoring-correct-answer.test.ts
git commit -m "feat(questionnaires): scoring lit questions.correct_answer (repli legacy)"
```

---

### Task 3: Éditeur admin — saisie de la bonne réponse

**Files:**
- Modify: `src/app/(dashboard)/admin/questionnaires/page.tsx`

- [ ] **Step 1: Étendre `QuestionFormData` et `emptyQuestionForm`**

Remplacer :

```ts
interface QuestionFormData {
  text: string;
  type: QuestionType;
  is_required: boolean;
  options: string[];
}
```

par :

```ts
interface QuestionFormData {
  text: string;
  type: QuestionType;
  is_required: boolean;
  options: string[];
  correctAnswer: string | null;
}
```

Et remplacer :

```ts
const emptyQuestionForm: QuestionFormData = {
  text: "",
  type: "rating",
  is_required: true,
  options: ["", ""],
};
```

par :

```ts
const emptyQuestionForm: QuestionFormData = {
  text: "",
  type: "rating",
  is_required: true,
  options: ["", ""],
  correctAnswer: null,
};
```

- [ ] **Step 2: Réinitialiser `correctAnswer` au changement de type**

Remplacer le `onValueChange` du Select de type (autour de la ligne 967-968) :

```tsx
onValueChange={(v) => setQuestionForm((p) => ({ ...p, type: v as QuestionType, options: v === "multiple_choice" ? ["", ""] : [] }))}
```

par :

```tsx
onValueChange={(v) => setQuestionForm((p) => ({ ...p, type: v as QuestionType, options: v === "multiple_choice" ? ["", ""] : [], correctAnswer: null }))}
```

- [ ] **Step 3: Radio « bonne réponse » sur chaque option QCM + sync à l'édition**

Dans le bloc `{questionForm.type === "multiple_choice" && (...)}` (autour de 997-1033), remplacer l'input de chaque option (le `onChange` qui fait `newOpts[i] = e.target.value`) par une ligne incluant un radio. Remplacer le mapping des options :

```tsx
{questionForm.options.map((opt, i) => (
  <div key={i} className="flex items-center gap-2">
    {selectedQ && selectedQ.type !== "satisfaction" && (
      <input
        type="radio"
        name="admin-correct-mcq"
        title="Bonne réponse"
        className="h-4 w-4"
        checked={opt.trim() !== "" && questionForm.correctAnswer === opt}
        onChange={() => setQuestionForm((p) => ({ ...p, correctAnswer: opt }))}
      />
    )}
    <Input
      value={opt}
      placeholder={`Option ${i + 1}`}
      onChange={(e) => {
        const newOpts = [...questionForm.options];
        const old = newOpts[i];
        newOpts[i] = e.target.value;
        setQuestionForm((p) => ({
          ...p,
          options: newOpts,
          correctAnswer: p.correctAnswer === old ? e.target.value : p.correctAnswer,
        }));
      }}
    />
    {questionForm.options.length > 2 && (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          const removed = questionForm.options[i];
          const newOpts = questionForm.options.filter((_, idx) => idx !== i);
          setQuestionForm((p) => ({
            ...p,
            options: newOpts,
            correctAnswer: p.correctAnswer === removed ? null : p.correctAnswer,
          }));
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    )}
  </div>
))}
```

> Note : conserver les `import` existants (`Input`, `Button`, `Trash2`…). Si `Trash2` n'est pas importé, réutiliser l'icône déjà utilisée dans ce bloc pour la suppression d'option (vérifier l'import en tête de fichier et garder le même composant qu'avant).

Ajouter, juste sous la liste des options (avant le bouton « Ajouter une option »), un rappel + reset quand une bonne réponse est définie :

```tsx
{selectedQ && selectedQ.type !== "satisfaction" && questionForm.correctAnswer && (
  <button
    type="button"
    className="text-xs text-muted-foreground underline"
    onClick={() => setQuestionForm((p) => ({ ...p, correctAnswer: null }))}
  >
    Bonne réponse : « {questionForm.correctAnswer} » — retirer (non noté)
  </button>
)}
```

- [ ] **Step 4: Sélecteur de bonne réponse pour oui/non**

Juste après le bloc `{questionForm.type === "multiple_choice" && (...)}`, ajouter :

```tsx
{questionForm.type === "yes_no" && selectedQ && selectedQ.type !== "satisfaction" && (
  <div className="space-y-1">
    <Label>Bonne réponse</Label>
    <Select
      value={questionForm.correctAnswer ?? "none"}
      onValueChange={(v) => setQuestionForm((p) => ({ ...p, correctAnswer: v === "none" ? null : v }))}
    >
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Non noté</SelectItem>
        <SelectItem value="oui">Oui</SelectItem>
        <SelectItem value="non">Non</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 5: Persister `correct_answer` à l'ajout**

Dans `handleAddQuestion`, dans l'objet `payload`, ajouter le champ `correct_answer` (après `order_index`) :

```ts
    const payload = {
      questionnaire_id: selectedQ.id,
      text: questionForm.text.trim(),
      type: questionForm.type,
      is_required: questionForm.is_required,
      options: questionForm.type === "multiple_choice"
        ? questionForm.options.filter((o) => o.trim())
        : null,
      order_index: nextOrder,
      correct_answer:
        (questionForm.type === "multiple_choice" || questionForm.type === "yes_no") &&
        selectedQ.type !== "satisfaction"
          ? (questionForm.correctAnswer ?? null)
          : null,
    };
```

- [ ] **Step 6: Vérifier compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/admin/questionnaires/page.tsx"
git commit -m "feat(questionnaires): saisie bonne réponse QCM/oui-non dans l'éditeur admin"
```

---

### Task 4: Builder formateur — saisie de la bonne réponse

**Files:**
- Modify: `src/components/trainer/TrainerQuestionnaireBuilder.tsx`

- [ ] **Step 1: Étendre `BuilderQuestion`**

Remplacer :

```ts
export interface BuilderQuestion {
  text: string;
  type: BuilderQuestionType;
  options: string[];
  is_required: boolean;
}
```

par (ajouter `correct_answer`) :

```ts
export interface BuilderQuestion {
  text: string;
  type: BuilderQuestionType;
  options: string[];
  is_required: boolean;
  correct_answer?: string | null;
}
```

- [ ] **Step 2: Défaut à l'ajout d'une question**

Dans `addQuestion` (le `setQuestions((p) => [...p, { ... }])`), ajouter `correct_answer: null` :

```ts
    setQuestions((p) => [...p, { text: "", type: "rating", options: [], is_required: true, correct_answer: null }]);
```

- [ ] **Step 3: Reset `correct_answer` au changement de type**

Remplacer le `onValueChange` du Select de type de question (autour de la ligne 145) :

```tsx
onValueChange={(v) => updateQuestion(i, { type: v as BuilderQuestionType })}
```

par :

```tsx
onValueChange={(v) => updateQuestion(i, { type: v as BuilderQuestionType, correct_answer: null })}
```

- [ ] **Step 4: UI bonne réponse (QCM + oui/non)**

Le bloc QCM existant (autour de 162-167) saisit les options en CSV. Juste après ce bloc `{q.type === "multiple_choice" && (...)}`, ajouter un sélecteur de bonne réponse alimenté par les options parsées ; et un sélecteur pour oui/non. `type` est la prop du builder (type du questionnaire) :

```tsx
{q.type === "multiple_choice" && type !== "satisfaction" && (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">Bonne réponse (optionnel)</label>
    <Select
      value={q.correct_answer ?? "none"}
      onValueChange={(v) => updateQuestion(i, { correct_answer: v === "none" ? null : v })}
    >
      <SelectTrigger><SelectValue placeholder="Non noté" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Non noté</SelectItem>
        {q.options.filter((o) => o.trim()).map((o, oi) => (
          <SelectItem key={oi} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
{q.type === "yes_no" && type !== "satisfaction" && (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">Bonne réponse (optionnel)</label>
    <Select
      value={q.correct_answer ?? "none"}
      onValueChange={(v) => updateQuestion(i, { correct_answer: v === "none" ? null : v })}
    >
      <SelectTrigger><SelectValue placeholder="Non noté" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Non noté</SelectItem>
        <SelectItem value="oui">Oui</SelectItem>
        <SelectItem value="non">Non</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}
```

> Note : vérifier que `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` sont importés dans ce fichier ; sinon les ajouter depuis `@/components/ui/select`. `type` est la variable d'état du questionnaire déjà présente dans le composant (cf. payload `{ title, description, type, questions }`).

- [ ] **Step 5: Le payload envoie déjà `correct_answer`**

Aucun changement : `body: JSON.stringify({ title, description, type, questions })` sérialise `questions` qui contient désormais `correct_answer`. Vérifier visuellement que le `handleSave` envoie bien `questions` tel quel (ne pas mapper/filtrer les champs).

- [ ] **Step 6: Vérifier compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 7: Commit**

```bash
git add src/components/trainer/TrainerQuestionnaireBuilder.tsx
git commit -m "feat(questionnaires): saisie bonne réponse dans le builder formateur"
```

---

### Task 5: Routes formateur — persister `correct_answer`

**Files:**
- Modify: `src/app/api/trainer/questionnaires/route.ts` (POST)
- Modify: `src/app/api/trainer/questionnaires/[id]/route.ts` (PUT)

- [ ] **Step 1: POST — accepter et persister `correct_answer`**

Dans `src/app/api/trainer/questionnaires/route.ts` :

Étendre l'interface `QuestionInput` (ajouter le champ) :

```ts
interface QuestionInput {
  text: string;
  type: string;
  options: string[] | null;
  is_required: boolean;
  correct_answer?: string | null;
}
```

Dans le `.map((q, i) => ({ ... }))` qui construit les `rows` de `questions`, ajouter la ligne `correct_answer` :

```ts
      const rows = questions.map((q, i) => ({
        questionnaire_id: created.id,
        text: q.text.trim(),
        type: ALLOWED_TYPES.includes(q.type as typeof ALLOWED_TYPES[number]) ? q.type : "text",
        options: q.type === "multiple_choice" ? (q.options ?? []).filter((o) => o.trim()) : null,
        is_required: q.is_required !== false,
        order_index: i + 1,
        correct_answer:
          (q.type === "multiple_choice" || q.type === "yes_no") ? (q.correct_answer ?? null) : null,
      }));
```

- [ ] **Step 2: PUT — même ajout**

Dans `src/app/api/trainer/questionnaires/[id]/route.ts`, étendre l'interface `QuestionInput` de la même façon (ajouter `correct_answer?: string | null;`), puis dans le `.map((q, i) => ({ ... }))` qui reconstruit les `rows` (après le `delete` des questions), ajouter :

```ts
        correct_answer:
          (q.type === "multiple_choice" || q.type === "yes_no") ? (q.correct_answer ?? null) : null,
```

(à insérer dans l'objet row, après `options` / `is_required` / `order_index` selon la structure existante).

- [ ] **Step 3: Vérifier compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/trainer/questionnaires/route.ts "src/app/api/trainer/questionnaires/[id]/route.ts"
git commit -m "feat(questionnaires): routes formateur persistent correct_answer"
```

---

### Task 6: Édition formateur — charger `correct_answer`

**Files:**
- Modify: `src/app/(dashboard)/trainer/questionnaires/[id]/edit/page.tsx`

- [ ] **Step 1: Sélectionner + mapper `correct_answer`**

Remplacer le `.select("text, type, options, is_required, order_index")` par :

```ts
        .select("text, type, options, is_required, order_index, correct_answer")
```

Dans le `.map((qq) => ({ ... }))` qui construit les `BuilderQuestion`, ajouter le champ `correct_answer`. Adapter le typage inline de la source pour l'inclure :

```ts
        questions: ((questions as Array<{ text: string; type: string; options: string[] | null; is_required: boolean; correct_answer: string | null }> | null) ?? []).map((qq) => ({
          text: qq.text,
          type: (["rating", "text", "multiple_choice", "yes_no"].includes(qq.type) ? qq.type : "text") as BuilderQuestionType,
          options: qq.options ?? [],
          is_required: qq.is_required,
          correct_answer: qq.correct_answer ?? null,
        })),
```

> Note : conserver les autres champs déjà mappés dans cet objet (`text`, `type`, `options`, `is_required`) ; n'ajouter que `correct_answer`. Vérifier les noms exacts des propriétés déjà présentes avant d'éditer.

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/trainer/questionnaires/[id]/edit/page.tsx"
git commit -m "feat(questionnaires): édition formateur recharge correct_answer"
```

---

### Task 7: Vérification finale

- [ ] **Step 1: Barrières complètes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 0 erreur ; toute la suite verte.

- [ ] **Step 2: Vérification manuelle (prod/preview après déploiement)**

1. Admin → Questionnaires → créer/ouvrir un questionnaire de type **évaluation** → ajouter une question QCM → cocher la bonne option → enregistrer. Ajouter une question oui/non → choisir « Oui ». Vérifier qu'un questionnaire de type **satisfaction** n'affiche PAS la saisie de bonne réponse.
2. Faire répondre un apprenant (ou insérer une réponse), puis ouvrir les **résultats** (onglet Évaluation / PDF résultats-évaluations) → le score/% doit apparaître.
3. Formateur → créer un questionnaire avec QCM + bonne réponse → enregistrer → rouvrir en édition → la bonne réponse est rechargée.

- [ ] **Step 3: Push**

```bash
git push origin main
```

(Rappel : la migration Task 1 doit avoir été jouée en prod AVANT ce push.)

---

## Notes d'implémentation

- **YAGNI** : pas de barème/pondération (1 point par question scorable), pas de correction du texte libre, pas d'affichage côté apprenant, pas de backfill des QCM existants.
- **Repli legacy** : la double lecture (`question.correct_answer` puis `options.correct_answer`) garantit qu'aucun questionnaire généré par IA ne régresse.
- **Gate satisfaction** : côté admin via `selectedQ.type`, côté formateur via la prop `type` du builder.
